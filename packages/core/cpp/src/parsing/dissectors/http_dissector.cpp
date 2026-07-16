#include "parsing/dissectors/http_dissector.hpp"

#include <algorithm>
#include <cctype>
#include <cstddef>
#include <cstdint>
#include <limits>
#include <optional>
#include <span>
#include <string>
#include <string_view>
#include <vector>

#include "parsing/dissector_context.hpp"
#include "parsing/dissectors/dissector_states.hpp"
#include "parsing/dissectors/dissector_utils.hpp"

namespace pruftnet::parsing::internal {
namespace {

constexpr std::size_t kMaximumLineLength = 16U << 10U;
constexpr std::size_t kMaximumHeaders = 256;
constexpr std::size_t kMaximumChunks = 65'536;

enum class FrameStatus {
  Complete,
  Incomplete,
  Malformed,
};

struct LineLayout {
  std::size_t start = 0;
  std::size_t content_end = 0;
  std::size_t wire_end = 0;
};

struct HeaderLayout {
  LineLayout line;
  std::size_t name_end = 0;
  std::size_t value_start = 0;
  std::size_t value_end = 0;
  std::string lower_name;
  std::string lower_value;
};

struct ChunkLayout {
  LineLayout size_line;
  std::size_t extension_start = 0;
  std::size_t extension_end = 0;
  std::size_t data_start = 0;
  std::size_t data_length = 0;
  std::size_t wire_end = 0;
  std::uint64_t size = 0;
};

struct MessageLayout {
  FrameStatus status = FrameStatus::Incomplete;
  LineLayout start_line;
  std::vector<HeaderLayout> headers;
  std::vector<ChunkLayout> chunks;
  std::size_t parsed_end = 0;
  std::size_t render_length = 0;
  std::size_t total_length = 0;
  std::size_t method_end = 0;
  std::size_t target_start = 0;
  std::size_t target_end = 0;
  std::size_t version_start = 0;
  std::size_t status_start = 0;
  std::size_t reason_start = 0;
  std::size_t body_start = 0;
  std::size_t body_length = 0;
  std::uint64_t content_length = 0;
  std::uint16_t status_code = 0;
  std::size_t host_count = 0;
  bool response = false;
  bool has_content_length = false;
  bool chunked = false;
  bool close_delimited = false;
};

struct LineResult {
  FrameStatus status = FrameStatus::Incomplete;
  LineLayout line;
};

bool is_token_character(std::uint8_t value) noexcept {
  return std::isalnum(value) != 0 ||
         std::string_view("!#$%&'*+-.^_`|~").find(static_cast<char>(value)) !=
             std::string_view::npos;
}

std::string_view bytes_view(std::span<const std::byte> bytes, std::size_t start,
                            std::size_t end) {
  return {reinterpret_cast<const char *>(bytes.data() + start), end - start};
}

std::string lower_ascii(std::string_view value) {
  std::string result;
  result.reserve(value.size());
  for (const auto character : value) {
    result.push_back(
        static_cast<char>(std::tolower(static_cast<unsigned char>(character))));
  }
  return result;
}

std::pair<std::size_t, std::size_t> trim_ows(std::span<const std::byte> bytes,
                                             std::size_t start,
                                             std::size_t end) noexcept {
  while (start < end) {
    const auto value = std::to_integer<std::uint8_t>(bytes[start]);
    if (value != ' ' && value != '\t') {
      break;
    }
    ++start;
  }
  while (end > start) {
    const auto value = std::to_integer<std::uint8_t>(bytes[end - 1]);
    if (value != ' ' && value != '\t') {
      break;
    }
    --end;
  }
  return {start, end};
}

LineResult next_line(std::span<const std::byte> bytes, std::size_t start) {
  const auto available = bytes.size() - start;
  const auto search_length = std::min(available, kMaximumLineLength + 1U);
  const auto found = std::find(
      bytes.begin() + static_cast<std::ptrdiff_t>(start),
      bytes.begin() + static_cast<std::ptrdiff_t>(start + search_length),
      std::byte{'\n'});
  if (found ==
      bytes.begin() + static_cast<std::ptrdiff_t>(start + search_length)) {
    return {available > kMaximumLineLength ? FrameStatus::Malformed
                                           : FrameStatus::Incomplete,
            {}};
  }
  const auto newline = static_cast<std::size_t>(found - bytes.begin());
  auto content_end = newline;
  if (content_end > start && bytes[content_end - 1] == std::byte{'\r'}) {
    --content_end;
  }
  if (std::find(bytes.begin() + static_cast<std::ptrdiff_t>(start),
                bytes.begin() + static_cast<std::ptrdiff_t>(content_end),
                std::byte{'\r'}) !=
      bytes.begin() + static_cast<std::ptrdiff_t>(content_end)) {
    return {FrameStatus::Malformed, {}};
  }
  return {FrameStatus::Complete, LineLayout{start, content_end, newline + 1}};
}

bool valid_http_version(std::span<const std::byte> bytes, std::size_t start,
                        std::size_t end) noexcept {
  return end - start == 8 && bytes[start] == std::byte{'H'} &&
         bytes[start + 1] == std::byte{'T'} &&
         bytes[start + 2] == std::byte{'T'} &&
         bytes[start + 3] == std::byte{'P'} &&
         bytes[start + 4] == std::byte{'/'} &&
         std::isdigit(std::to_integer<std::uint8_t>(bytes[start + 5])) != 0 &&
         bytes[start + 6] == std::byte{'.'} &&
         std::isdigit(std::to_integer<std::uint8_t>(bytes[start + 7])) != 0;
}

bool parse_decimal(std::string_view value, std::uint64_t &result) noexcept {
  if (value.empty()) {
    return false;
  }
  std::uint64_t parsed = 0;
  for (const auto character : value) {
    if (character < '0' || character > '9') {
      return false;
    }
    const auto digit = static_cast<std::uint64_t>(character - '0');
    if (parsed > (std::numeric_limits<std::uint64_t>::max() - digit) / 10U) {
      return false;
    }
    parsed = parsed * 10U + digit;
  }
  result = parsed;
  return true;
}

bool parse_content_length(std::string_view value,
                          std::uint64_t &result) noexcept {
  bool initialized = false;
  std::size_t start = 0;
  while (start <= value.size()) {
    const auto comma = value.find(',', start);
    auto part = value.substr(
        start,
        (comma == std::string_view::npos ? value.size() : comma) - start);
    while (!part.empty() && (part.front() == ' ' || part.front() == '\t')) {
      part.remove_prefix(1);
    }
    while (!part.empty() && (part.back() == ' ' || part.back() == '\t')) {
      part.remove_suffix(1);
    }
    std::uint64_t parsed = 0;
    if (!parse_decimal(part, parsed) || (initialized && parsed != result)) {
      return false;
    }
    result = parsed;
    initialized = true;
    if (comma == std::string_view::npos) {
      break;
    }
    start = comma + 1;
  }
  return initialized;
}

bool transfer_encoding_ends_in_chunked(std::string_view value) {
  const auto comma = value.rfind(',');
  auto final = value.substr(comma == std::string_view::npos ? 0 : comma + 1);
  while (!final.empty() && (final.front() == ' ' || final.front() == '\t')) {
    final.remove_prefix(1);
  }
  while (!final.empty() && (final.back() == ' ' || final.back() == '\t')) {
    final.remove_suffix(1);
  }
  const auto semicolon = final.find(';');
  if (semicolon != std::string_view::npos) {
    final = final.substr(0, semicolon);
    while (!final.empty() && (final.back() == ' ' || final.back() == '\t')) {
      final.remove_suffix(1);
    }
  }
  return final == "chunked";
}

bool parse_hex(std::string_view value, std::uint64_t &result) noexcept {
  if (value.empty()) {
    return false;
  }
  std::uint64_t parsed = 0;
  for (const auto character : value) {
    std::uint8_t digit = 0;
    if (character >= '0' && character <= '9') {
      digit = static_cast<std::uint8_t>(character - '0');
    } else if (character >= 'a' && character <= 'f') {
      digit = static_cast<std::uint8_t>(character - 'a' + 10);
    } else if (character >= 'A' && character <= 'F') {
      digit = static_cast<std::uint8_t>(character - 'A' + 10);
    } else {
      return false;
    }
    if (parsed > (std::numeric_limits<std::uint64_t>::max() - digit) / 16U) {
      return false;
    }
    parsed = parsed * 16U + digit;
  }
  result = parsed;
  return true;
}

FrameStatus parse_start_line(std::span<const std::byte> bytes,
                             MessageLayout &layout) {
  const auto line = next_line(bytes, 0);
  if (line.status != FrameStatus::Complete) {
    return line.status;
  }
  layout.start_line = line.line;
  layout.parsed_end = line.line.wire_end;
  const auto start = line.line.start;
  const auto end = line.line.content_end;
  if (end - start >= 5 && bytes[start] == std::byte{'H'} &&
      bytes[start + 1] == std::byte{'T'} &&
      bytes[start + 2] == std::byte{'T'} &&
      bytes[start + 3] == std::byte{'P'} &&
      bytes[start + 4] == std::byte{'/'}) {
    layout.response = true;
    if (end - start < 13 || !valid_http_version(bytes, start, start + 8) ||
        bytes[start + 8] != std::byte{' '} ||
        bytes[start + 12] != std::byte{' '}) {
      return FrameStatus::Malformed;
    }
    for (std::size_t index = start + 9; index < start + 12; ++index) {
      if (std::isdigit(std::to_integer<std::uint8_t>(bytes[index])) == 0) {
        return FrameStatus::Malformed;
      }
    }
    layout.version_start = start;
    layout.status_start = start + 9;
    layout.status_code = static_cast<std::uint16_t>(
        (std::to_integer<std::uint8_t>(bytes[start + 9]) - '0') * 100 +
        (std::to_integer<std::uint8_t>(bytes[start + 10]) - '0') * 10 +
        (std::to_integer<std::uint8_t>(bytes[start + 11]) - '0'));
    layout.reason_start = start + 13;
    return FrameStatus::Complete;
  }

  const auto first_space = std::find(
      bytes.begin() + static_cast<std::ptrdiff_t>(start),
      bytes.begin() + static_cast<std::ptrdiff_t>(end), std::byte{' '});
  if (first_space == bytes.begin() + static_cast<std::ptrdiff_t>(end)) {
    return FrameStatus::Malformed;
  }
  const auto method_end = static_cast<std::size_t>(first_space - bytes.begin());
  if (method_end == start ||
      !std::all_of(bytes.begin() + static_cast<std::ptrdiff_t>(start),
                   first_space, [](std::byte value) {
                     return is_token_character(
                         std::to_integer<std::uint8_t>(value));
                   })) {
    return FrameStatus::Malformed;
  }
  const auto second_space = std::find(
      first_space + 1, bytes.begin() + static_cast<std::ptrdiff_t>(end),
      std::byte{' '});
  if (second_space == bytes.begin() + static_cast<std::ptrdiff_t>(end)) {
    return FrameStatus::Malformed;
  }
  const auto target_start = method_end + 1;
  const auto target_end =
      static_cast<std::size_t>(second_space - bytes.begin());
  const auto version_start = target_end + 1;
  if (target_start == target_end ||
      !valid_http_version(bytes, version_start, end)) {
    return FrameStatus::Malformed;
  }
  layout.method_end = method_end;
  layout.target_start = target_start;
  layout.target_end = target_end;
  layout.version_start = version_start;
  return FrameStatus::Complete;
}

FrameStatus parse_headers(std::span<const std::byte> bytes, std::size_t &offset,
                          MessageLayout &layout, bool framing_headers) {
  std::optional<std::uint64_t> content_length;
  std::string transfer_encoding;
  bool has_transfer_encoding = false;
  while (offset < bytes.size()) {
    const auto line = next_line(bytes, offset);
    if (line.status != FrameStatus::Complete) {
      layout.parsed_end = offset;
      return line.status;
    }
    if (line.line.content_end == line.line.start) {
      offset = line.line.wire_end;
      layout.parsed_end = offset;
      if (framing_headers) {
        if (content_length) {
          layout.has_content_length = true;
          layout.content_length = *content_length;
        }
        if (has_transfer_encoding) {
          layout.chunked = transfer_encoding_ends_in_chunked(transfer_encoding);
          if (layout.has_content_length) {
            return FrameStatus::Malformed;
          }
          if (!layout.response && !layout.chunked) {
            return FrameStatus::Malformed;
          }
        }
      }
      return FrameStatus::Complete;
    }
    if (layout.headers.size() >= kMaximumHeaders) {
      return FrameStatus::Malformed;
    }
    const auto first = std::to_integer<std::uint8_t>(bytes[line.line.start]);
    if (first == ' ' || first == '\t') {
      return FrameStatus::Malformed;
    }
    const auto colon = std::find(
        bytes.begin() + static_cast<std::ptrdiff_t>(line.line.start),
        bytes.begin() + static_cast<std::ptrdiff_t>(line.line.content_end),
        std::byte{':'});
    if (colon ==
        bytes.begin() + static_cast<std::ptrdiff_t>(line.line.content_end)) {
      return FrameStatus::Malformed;
    }
    const auto name_end = static_cast<std::size_t>(colon - bytes.begin());
    if (name_end == line.line.start ||
        !std::all_of(
            bytes.begin() + static_cast<std::ptrdiff_t>(line.line.start), colon,
            [](std::byte value) {
              return is_token_character(std::to_integer<std::uint8_t>(value));
            })) {
      return FrameStatus::Malformed;
    }
    const auto [value_start, value_end] =
        trim_ows(bytes, name_end + 1, line.line.content_end);
    HeaderLayout header{
        .line = line.line,
        .name_end = name_end,
        .value_start = value_start,
        .value_end = value_end,
        .lower_name = lower_ascii(bytes_view(bytes, line.line.start, name_end)),
        .lower_value = lower_ascii(bytes_view(bytes, value_start, value_end)),
    };
    if (framing_headers && header.lower_name == "content-length") {
      std::uint64_t parsed = 0;
      if (!parse_content_length(header.lower_value, parsed) ||
          (content_length && *content_length != parsed)) {
        return FrameStatus::Malformed;
      }
      content_length = parsed;
    } else if (framing_headers && header.lower_name == "transfer-encoding") {
      if (has_transfer_encoding) {
        transfer_encoding += ",";
      }
      transfer_encoding += header.lower_value;
      has_transfer_encoding = true;
    } else if (framing_headers && header.lower_name == "host") {
      ++layout.host_count;
    }
    layout.headers.push_back(std::move(header));
    offset = line.line.wire_end;
    layout.parsed_end = offset;
  }
  return FrameStatus::Incomplete;
}

FrameStatus parse_chunked(std::span<const std::byte> bytes, std::size_t offset,
                          MessageLayout &layout) {
  while (offset < bytes.size()) {
    if (layout.chunks.size() >= kMaximumChunks) {
      return FrameStatus::Malformed;
    }
    const auto size_line = next_line(bytes, offset);
    if (size_line.status != FrameStatus::Complete) {
      layout.parsed_end = offset;
      return size_line.status;
    }
    const auto semicolon = std::find(
        bytes.begin() + static_cast<std::ptrdiff_t>(size_line.line.start),
        bytes.begin() + static_cast<std::ptrdiff_t>(size_line.line.content_end),
        std::byte{';'});
    const auto size_end = static_cast<std::size_t>(semicolon - bytes.begin());
    const auto [hex_start, hex_end] =
        trim_ows(bytes, size_line.line.start, size_end);
    std::uint64_t chunk_size = 0;
    if (!parse_hex(bytes_view(bytes, hex_start, hex_end), chunk_size) ||
        chunk_size > std::numeric_limits<std::size_t>::max()) {
      return FrameStatus::Malformed;
    }
    ChunkLayout chunk{
        .size_line = size_line.line,
        .extension_start =
            semicolon == bytes.begin() + static_cast<std::ptrdiff_t>(
                                             size_line.line.content_end)
                ? size_line.line.content_end
                : static_cast<std::size_t>(semicolon - bytes.begin()) + 1,
        .extension_end = size_line.line.content_end,
        .data_start = size_line.line.wire_end,
        .size = chunk_size,
    };
    offset = size_line.line.wire_end;
    if (chunk_size == 0) {
      chunk.wire_end = offset;
      layout.chunks.push_back(chunk);
      layout.parsed_end = offset;
      const auto trailers = parse_headers(bytes, offset, layout, false);
      if (trailers != FrameStatus::Complete) {
        return trailers;
      }
      layout.total_length = offset;
      layout.render_length = offset;
      return FrameStatus::Complete;
    }
    const auto size = static_cast<std::size_t>(chunk_size);
    if (size > bytes.size() - offset) {
      layout.parsed_end = offset;
      layout.body_start = offset;
      layout.body_length = bytes.size() - offset;
      return FrameStatus::Incomplete;
    }
    chunk.data_length = size;
    offset += size;
    if (offset == bytes.size()) {
      layout.parsed_end = offset;
      return FrameStatus::Incomplete;
    }
    if (bytes[offset] == std::byte{'\r'}) {
      if (offset + 1 >= bytes.size()) {
        layout.parsed_end = offset;
        return FrameStatus::Incomplete;
      }
      if (bytes[offset + 1] != std::byte{'\n'}) {
        return FrameStatus::Malformed;
      }
      offset += 2;
    } else if (bytes[offset] == std::byte{'\n'}) {
      ++offset;
    } else {
      return FrameStatus::Malformed;
    }
    chunk.wire_end = offset;
    layout.chunks.push_back(chunk);
    layout.parsed_end = offset;
  }
  return FrameStatus::Incomplete;
}

MessageLayout frame_message(std::span<const std::byte> bytes,
                            bool end_of_stream) {
  MessageLayout layout;
  layout.render_length = bytes.size();
  auto status = parse_start_line(bytes, layout);
  if (status != FrameStatus::Complete) {
    layout.status = status;
    return layout;
  }
  auto offset = layout.start_line.wire_end;
  status = parse_headers(bytes, offset, layout, true);
  if (status != FrameStatus::Complete) {
    layout.status = status;
    return layout;
  }
  if (!layout.response) {
    const auto version =
        bytes_view(bytes, layout.version_start, layout.start_line.content_end);
    if (layout.host_count > 1 ||
        (version == "HTTP/1.1" && layout.host_count != 1)) {
      layout.status = FrameStatus::Malformed;
      return layout;
    }
  }

  const bool no_response_body =
      layout.response &&
      ((layout.status_code >= 100 && layout.status_code < 200) ||
       layout.status_code == 204 || layout.status_code == 304);
  if (no_response_body) {
    layout.total_length = offset;
    layout.render_length = offset;
    layout.status = FrameStatus::Complete;
    return layout;
  }
  if (layout.chunked) {
    layout.status = parse_chunked(bytes, offset, layout);
    return layout;
  }
  if (layout.has_content_length) {
    if (layout.content_length > std::numeric_limits<std::size_t>::max()) {
      layout.status = FrameStatus::Malformed;
      return layout;
    }
    const auto body_length = static_cast<std::size_t>(layout.content_length);
    layout.body_start = offset;
    layout.body_length = std::min(body_length, bytes.size() - offset);
    if (body_length > bytes.size() - offset) {
      layout.parsed_end = bytes.size();
      layout.status = FrameStatus::Incomplete;
      return layout;
    }
    layout.total_length = offset + body_length;
    layout.render_length = layout.total_length;
    layout.status = FrameStatus::Complete;
    return layout;
  }
  if (!layout.response) {
    layout.total_length = offset;
    layout.render_length = offset;
    layout.status = FrameStatus::Complete;
    return layout;
  }

  layout.close_delimited = true;
  layout.body_start = offset;
  layout.body_length = bytes.size() - offset;
  layout.parsed_end = bytes.size();
  if (end_of_stream) {
    layout.total_length = bytes.size();
    layout.render_length = bytes.size();
    layout.status = FrameStatus::Complete;
  } else {
    layout.status = FrameStatus::Incomplete;
  }
  return layout;
}

std::string escaped_range(std::span<const std::byte> bytes, std::size_t start,
                          std::size_t end) {
  return escaped_ascii(bytes.subspan(start, end - start));
}

bool add_string_range(DissectorContext &context, FieldId field,
                      std::uint32_t parent, const PacketView &view,
                      std::span<const std::byte> bytes, std::size_t start,
                      std::size_t end) {
  return context.add_string(field, parent, view, start, end - start,
                            escaped_range(bytes, start, end));
}

bool render_message(DissectorContext &context, const HttpDissectorState &state,
                    const PacketView &stream, std::uint32_t parent,
                    const MessageLayout &layout) {
  const auto bytes = stream.captured();
  const auto message = context.add_protocol(
      state.message, parent, stream,
      std::min(layout.render_length, stream.captured_length()));
  if (!message) {
    return false;
  }
  if (!context.add_unsigned(layout.response ? state.response : state.request,
                            *message, stream, 0, 0, 1,
                            ParsedNodeFlagGenerated)) {
    return false;
  }
  if (layout.start_line.wire_end != 0) {
    const auto line_field =
        layout.response ? state.response_line : state.request_line;
    if (!add_string_range(context, line_field, *message, stream, bytes,
                          layout.start_line.start,
                          layout.start_line.content_end)) {
      return false;
    }
    if (layout.response) {
      if (!add_string_range(context, state.version, *message, stream, bytes,
                            layout.version_start, layout.version_start + 8) ||
          !context.add_unsigned(state.status_code, *message, stream,
                                layout.status_start, 3, layout.status_code) ||
          !add_string_range(context, state.reason_phrase, *message, stream,
                            bytes, layout.reason_start,
                            layout.start_line.content_end)) {
        return false;
      }
    } else if (!add_string_range(context, state.method, *message, stream, bytes,
                                 0, layout.method_end) ||
               !add_string_range(context, state.request_target, *message,
                                 stream, bytes, layout.target_start,
                                 layout.target_end) ||
               !add_string_range(context, state.version, *message, stream,
                                 bytes, layout.version_start,
                                 layout.start_line.content_end)) {
      return false;
    }
  }

  for (const auto &header : layout.headers) {
    const auto header_view = stream.subview(
        header.line.start, header.line.wire_end - header.line.start);
    if (!header_view.has_value()) {
      context.mark_malformed();
      return false;
    }
    const auto header_node =
        context.add_protocol(state.header, *message, *header_view.value(),
                             header_view.value()->captured_length());
    if (!header_node ||
        !add_string_range(context, state.header_name, *header_node, stream,
                          bytes, header.line.start, header.name_end) ||
        !add_string_range(context, state.header_value, *header_node, stream,
                          bytes, header.value_start, header.value_end)) {
      return false;
    }
    FieldId special;
    if (header.lower_name == "host") {
      special = state.host;
    } else if (header.lower_name == "user-agent") {
      special = state.user_agent;
    } else if (header.lower_name == "content-type") {
      special = state.content_type;
    } else if (header.lower_name == "transfer-encoding") {
      special = state.transfer_encoding;
    } else if (header.lower_name == "connection") {
      special = state.connection;
    }
    if (special.is_valid() &&
        !add_string_range(context, special, *header_node, stream, bytes,
                          header.value_start, header.value_end)) {
      return false;
    }
    if (header.lower_name == "content-length") {
      std::uint64_t value = 0;
      if (parse_content_length(header.lower_value, value) &&
          !context.add_unsigned(state.content_length, *header_node, stream,
                                header.value_start,
                                header.value_end - header.value_start, value)) {
        return false;
      }
    }
  }

  for (const auto &chunk : layout.chunks) {
    const auto chunk_view = stream.subview(
        chunk.size_line.start, chunk.wire_end - chunk.size_line.start);
    if (!chunk_view.has_value()) {
      context.mark_malformed();
      return false;
    }
    const auto chunk_node =
        context.add_protocol(state.chunk, *message, *chunk_view.value(),
                             chunk_view.value()->captured_length());
    if (!chunk_node ||
        !context.add_unsigned(
            state.chunk_size, *chunk_node, stream, chunk.size_line.start,
            chunk.size_line.content_end - chunk.size_line.start, chunk.size)) {
      return false;
    }
    if (chunk.extension_start < chunk.extension_end &&
        !add_string_range(context, state.chunk_extension, *chunk_node, stream,
                          bytes, chunk.extension_start, chunk.extension_end)) {
      return false;
    }
    if (chunk.data_length != 0 &&
        !context.add_bytes(
            state.chunk_data, *chunk_node, stream, chunk.data_start,
            bytes.subspan(chunk.data_start, chunk.data_length))) {
      return false;
    }
  }

  if (!layout.chunked && layout.body_length != 0 &&
      !context.add_bytes(
          state.body, *message, stream, layout.body_start,
          bytes.subspan(layout.body_start, layout.body_length))) {
    return false;
  }
  if (layout.status != FrameStatus::Complete &&
      layout.parsed_end < bytes.size() &&
      !context.add_bytes(state.trailing, *message, stream, layout.parsed_end,
                         bytes.subspan(layout.parsed_end))) {
    return false;
  }
  return true;
}

} // namespace

DissectionResult dissect_http(DissectorContext &context, const void *opaque,
                              const PacketView &view, std::uint32_t parent) {
  const auto &state = *static_cast<const HttpDissectorState *>(opaque);
  const auto stream =
      context.add_protocol(state.stream, parent, view, view.captured_length());
  if (!stream || context.stopped()) {
    return {};
  }

  std::size_t offset = 0;
  while (offset < view.captured_length()) {
    if (!context.consume_dissector_call()) {
      return {offset};
    }
    const auto remaining = view.captured().subspan(offset);
    auto layout = frame_message(remaining, context.transport_end_of_stream());
    const auto message_view =
        view.subview(offset, std::min(layout.render_length, remaining.size()));
    if (!message_view.has_value()) {
      context.mark_malformed();
      return {view.captured_length()};
    }
    if (!render_message(context, state, *message_view.value(), *stream,
                        layout)) {
      return {offset};
    }
    if (layout.status == FrameStatus::Malformed) {
      context.mark_malformed();
      return {view.captured_length()};
    }
    if (layout.status == FrameStatus::Incomplete) {
      return {offset};
    }
    if (layout.total_length == 0 || layout.total_length > remaining.size()) {
      context.mark_malformed();
      return {view.captured_length()};
    }
    offset += layout.total_length;
  }
  return {offset};
}

} // namespace pruftnet::parsing::internal

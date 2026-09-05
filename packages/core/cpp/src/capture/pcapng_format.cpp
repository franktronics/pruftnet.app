#include "capture/pcapng_format.hpp"

#include <array>
#include <algorithm>
#include <cerrno>
#include <charconv>
#include <fstream>
#include <iomanip>
#include <limits>
#include <optional>
#include <sstream>
#include <string_view>
#include <utility>

namespace pruftnet::capture::internal {
namespace {

constexpr std::uint32_t kSectionHeaderBlock = 0x0a0d0d0a;
constexpr std::uint32_t kInterfaceDescriptionBlock = 0x00000001;
constexpr std::uint32_t kEnhancedPacketBlock = 0x00000006;
constexpr std::uint32_t kByteOrderMagic = 0x1a2b3c4d;
constexpr std::size_t kMaximumRecoveryBlock = 64 * 1024 * 1024;

std::size_t padded(std::size_t value) noexcept {
  return (value + 3U) & ~std::size_t{3U};
}

void append_u16(std::vector<std::byte> &output, std::uint16_t value) {
  output.push_back(std::byte(value & 0xffU));
  output.push_back(std::byte((value >> 8U) & 0xffU));
}

void append_u32(std::vector<std::byte> &output, std::uint32_t value) {
  for (unsigned shift = 0; shift < 32; shift += 8)
    output.push_back(std::byte((value >> shift) & 0xffU));
}

void append_u64(std::vector<std::byte> &output, std::uint64_t value) {
  for (unsigned shift = 0; shift < 64; shift += 8)
    output.push_back(std::byte((value >> shift) & 0xffU));
}

std::uint16_t read_u16(const std::byte *bytes) noexcept {
  return std::uint16_t(std::to_integer<unsigned char>(bytes[0])) |
         (std::uint16_t(std::to_integer<unsigned char>(bytes[1])) << 8U);
}

std::uint32_t read_u32(const std::byte *bytes) noexcept {
  std::uint32_t value = 0;
  for (unsigned shift = 0; shift < 32; shift += 8)
    value |= std::uint32_t(std::to_integer<unsigned char>(bytes[shift / 8]))
             << shift;
  return value;
}

void append_option(std::vector<std::byte> &output, std::uint16_t code,
                   std::span<const std::byte> value) {
  append_u16(output, code);
  append_u16(output, static_cast<std::uint16_t>(value.size()));
  output.insert(output.end(), value.begin(), value.end());
  output.resize(output.size() + padded(value.size()) - value.size(),
                std::byte{0});
}

void append_string_option(std::vector<std::byte> &output, std::uint16_t code,
                          std::string_view value) {
  append_option(output, code,
                std::as_bytes(std::span(value.data(), value.size())));
}

void append_end_option(std::vector<std::byte> &output) {
  append_u16(output, 0);
  append_u16(output, 0);
}

std::vector<std::byte> finish_block(std::uint32_t type,
                                    std::vector<std::byte> body) {
  const auto length = static_cast<std::uint32_t>(12 + body.size());
  std::vector<std::byte> block;
  block.reserve(length);
  append_u32(block, type);
  append_u32(block, length);
  block.insert(block.end(), body.begin(), body.end());
  append_u32(block, length);
  return block;
}

std::optional<std::string_view> option_string(std::span<const std::byte> block,
                                              std::size_t offset,
                                              std::uint16_t requested) {
  while (offset + 4 <= block.size() - 4) {
    const auto code = read_u16(block.data() + offset);
    const auto length = read_u16(block.data() + offset + 2);
    offset += 4;
    if (code == 0)
      return std::nullopt;
    if (offset + padded(length) > block.size() - 4)
      return std::nullopt;
    if (code == requested) {
      return std::string_view(
          reinterpret_cast<const char *>(block.data() + offset), length);
    }
    offset += padded(length);
  }
  return std::nullopt;
}

bool parse_u64(std::string_view value, std::uint64_t &output, int base = 10) {
  const auto result =
      std::from_chars(value.data(), value.data() + value.size(), output, base);
  return result.ec == std::errc{} && result.ptr == value.data() + value.size();
}

std::optional<sniffing::CaptureId>
parse_capture_comment(std::string_view comment) {
  constexpr std::string_view prefix = "pruftnet.capture_id=";
  if (!comment.starts_with(prefix) || comment.size() != prefix.size() + 32)
    return std::nullopt;
  sniffing::CaptureId id;
  if (!parse_u64(comment.substr(prefix.size(), 16), id.high, 16) ||
      !parse_u64(comment.substr(prefix.size() + 16), id.low, 16))
    return std::nullopt;
  return id;
}

bool parse_packet_comment(std::string_view comment, std::uint64_t &packet_id,
                          std::uint32_t &flags) {
  constexpr std::string_view prefix = "pruftnet.packet_id=";
  constexpr std::string_view separator = ";flags=";
  if (!comment.starts_with(prefix))
    return false;
  const auto split = comment.find(separator, prefix.size());
  if (split == std::string_view::npos)
    return false;
  std::uint64_t raw_flags = 0;
  if (!parse_u64(comment.substr(prefix.size(), split - prefix.size()),
                 packet_id) ||
      !parse_u64(comment.substr(split + separator.size()), raw_flags) ||
      raw_flags > std::numeric_limits<std::uint32_t>::max())
    return false;
  flags = static_cast<std::uint32_t>(raw_flags);
  return true;
}

} // namespace

std::string capture_id_hex(sniffing::CaptureId id) {
  std::ostringstream output;
  output << std::hex << std::setfill('0') << std::setw(16) << id.high
         << std::setw(16) << id.low;
  return output.str();
}

std::vector<std::byte> encode_section_header(sniffing::CaptureId capture_id) {
  std::vector<std::byte> body;
  append_u32(body, kByteOrderMagic);
  append_u16(body, 1);
  append_u16(body, 0);
  append_u64(body, std::numeric_limits<std::uint64_t>::max());
  append_string_option(body, 1,
                       "pruftnet.capture_id=" + capture_id_hex(capture_id));
  append_string_option(body, 4, "Pruftnet capture spool");
  append_end_option(body);
  return finish_block(kSectionHeaderBlock, std::move(body));
}

std::vector<std::byte>
encode_interface_description(const SpoolInterface &interface) {
  std::vector<std::byte> body;
  append_u16(body, interface.link_type);
  append_u16(body, 0);
  append_u32(body, interface.snaplen);
  append_string_option(body, 1,
                       "pruftnet.interface_id=" +
                           std::to_string(interface.interface_id));
  append_string_option(body, 2, interface.name);
  const std::array resolution{std::byte(interface.timestamp_resolution)};
  append_option(body, 9, resolution);
  append_end_option(body);
  return finish_block(kInterfaceDescriptionBlock, std::move(body));
}

std::vector<std::byte> encode_enhanced_packet(
    const sniffing::PacketMetadata &metadata, std::uint32_t interface_index,
    std::uint8_t timestamp_resolution, std::span<const std::byte> bytes) {
  std::vector<std::byte> body;
  body.reserve(32 + padded(bytes.size()) + 96);
  append_u32(body, interface_index);
  const auto timestamp = timestamp_resolution == 6
                             ? metadata.timestamp_ns / 1'000
                             : metadata.timestamp_ns;
  append_u32(body, static_cast<std::uint32_t>(timestamp >> 32U));
  append_u32(body, static_cast<std::uint32_t>(timestamp));
  append_u32(body, metadata.captured_len);
  append_u32(body, metadata.wire_len);
  body.insert(body.end(), bytes.begin(), bytes.end());
  body.resize(body.size() + padded(bytes.size()) - bytes.size(), std::byte{0});
  append_string_option(
      body, 1,
      "pruftnet.packet_id=" + std::to_string(metadata.key.packet_id) +
          ";flags=" + std::to_string(metadata.flags));
  append_end_option(body);
  return finish_block(kEnhancedPacketBlock, std::move(body));
}

std::variant<PcapngSpool::RecoveryResult, SpoolError>
scan_segment(const std::filesystem::path &path, bool truncate_partial_tail,
             const PacketVisitor &visitor, std::stop_token stop,
             std::optional<std::uint64_t> target_offset) {
  std::ifstream input(path, std::ios::binary);
  if (!input)
    return SpoolError{
        SpoolFailureReason::OpenFailed,
        "Unable to open pcapng segment for recovery: " + path.string(), errno};
  std::error_code size_error;
  const auto file_size = std::filesystem::file_size(path, size_error);
  if (size_error)
    return SpoolError{SpoolFailureReason::OpenFailed,
                      "Unable to stat pcapng segment for recovery.",
                      size_error.value()};

  PcapngSpool::RecoveryResult result;
  sniffing::CaptureId capture_id;
  bool have_section = false;
  std::vector<SpoolInterface> interfaces;
  std::uint64_t offset = 0;
  bool jumped = false;
  std::uint64_t ordinal = 0;
  while (offset + 12 <= file_size) {
    if (stop.stop_requested())
      return SpoolError{SpoolFailureReason::ReadCancelled,
                        "Packet read was cancelled.", 0};
    std::array<std::byte, 8> header{};
    input.read(reinterpret_cast<char *>(header.data()), header.size());
    if (!input)
      break;
    const auto type = read_u32(header.data());
    const auto length = read_u32(header.data() + 4);
    if (target_offset && type == kEnhancedPacketBlock && !jumped) {
      if (*target_offset < offset || *target_offset > file_size - 12)
        break;
      jumped = true;
      offset = *target_offset;
      input.seekg(static_cast<std::streamoff>(offset));
      continue;
    }
    if (length < 12 || length % 4 != 0 || length > kMaximumRecoveryBlock ||
        offset + length > file_size)
      break;
    if (jumped && type != kEnhancedPacketBlock)
      break;
    std::vector<std::byte> block(length);
    std::copy(header.begin(), header.end(), block.begin());
    input.read(reinterpret_cast<char *>(block.data() + header.size()),
               length - header.size());
    if (!input || read_u32(block.data() + length - 4) != length)
      break;

    if (type == kSectionHeaderBlock) {
      if (length < 28 || read_u32(block.data() + 8) != kByteOrderMagic)
        return SpoolError{SpoolFailureReason::CorruptData,
                          "The pcapng section header is invalid.", 0};
      const auto comment = option_string(block, 24, 1);
      const auto parsed_capture =
          comment ? parse_capture_comment(*comment) : std::nullopt;
      if (!parsed_capture || parsed_capture->is_nil())
        return SpoolError{SpoolFailureReason::CorruptData,
                          "The pcapng section lacks a valid capture identity.",
                          0};
      if (have_section)
        return SpoolError{SpoolFailureReason::CorruptData,
                          "Multiple sections are not supported in a capture spool.", 0};
      capture_id = *parsed_capture;
      result.capture_id = capture_id;
      have_section = true;
    } else if (type == kInterfaceDescriptionBlock && have_section) {
      if (length < 24)
        break;
      SpoolInterface interface;
      interface.link_type = read_u16(block.data() + 8);
      interface.snaplen = read_u32(block.data() + 12);
      interface.interface_id = interfaces.size();
      if (const auto comment = option_string(block, 16, 1)) {
        constexpr std::string_view prefix = "pruftnet.interface_id=";
        std::uint64_t id = 0;
        if (comment->starts_with(prefix) &&
            parse_u64(comment->substr(prefix.size()), id) &&
            id <= std::numeric_limits<std::uint32_t>::max())
          interface.interface_id = static_cast<std::uint32_t>(id);
      }
      if (const auto name = option_string(block, 16, 2))
        interface.name = *name;
      if (const auto resolution = option_string(block, 16, 9);
          resolution && resolution->size() == 1)
        interface.timestamp_resolution =
            static_cast<std::uint8_t>((*resolution)[0]);
      interfaces.push_back(std::move(interface));
    } else if (type == kEnhancedPacketBlock && have_section) {
      if (length < 36)
        break;
      const auto interface_index = read_u32(block.data() + 8);
      const auto captured_length = read_u32(block.data() + 20);
      const auto wire_length = read_u32(block.data() + 24);
      const auto options_offset = 28 + padded(captured_length);
      if (interface_index >= interfaces.size() ||
          options_offset + 4 > length - 4)
        break;
      const auto comment = option_string(block, options_offset, 1);
      std::uint64_t packet_id = 0;
      std::uint32_t flags = 0;
      if (!comment || !parse_packet_comment(*comment, packet_id, flags))
        break;
      CommittedPacket packet;
      packet.ordinal = ordinal++;
      packet.segment_id = 1;
      packet.block_offset = offset;
      packet.data_offset = offset + 28;
      packet.block_length = length;
      packet.metadata.key = {capture_id, packet_id};
      const auto timestamp =
          (std::uint64_t(read_u32(block.data() + 12)) << 32U) |
          read_u32(block.data() + 16);
      if (interfaces[interface_index].timestamp_resolution == 6 &&
          timestamp > std::numeric_limits<std::uint64_t>::max() / 1'000)
        break;
      packet.metadata.timestamp_ns =
          interfaces[interface_index].timestamp_resolution == 6
              ? timestamp * 1'000
              : timestamp;
      packet.metadata.interface_id = interfaces[interface_index].interface_id;
      packet.metadata.captured_len = captured_length;
      packet.metadata.wire_len = wire_length;
      packet.metadata.link_type = interfaces[interface_index].link_type;
      packet.metadata.flags = flags;
      if (visitor)
        visitor(packet, std::span(block).subspan(28, captured_length));
      else
        result.packets.push_back(packet);
      if (target_offset) {
        result.valid_bytes = offset + length;
        return result;
      }
    }
    offset += length;
    result.valid_bytes = offset;
  }
  if (!have_section)
    return SpoolError{SpoolFailureReason::CorruptData,
                      "No valid pcapng section header was recovered.", 0};
  result.truncated_bytes = file_size - result.valid_bytes;
  if (truncate_partial_tail && result.truncated_bytes != 0) {
    std::error_code resize_error;
    std::filesystem::resize_file(path, result.valid_bytes, resize_error);
    if (resize_error)
      return SpoolError{SpoolFailureReason::FinalizeFailed,
                        "Unable to truncate the invalid pcapng tail.",
                        resize_error.value()};
  }
  return result;
}

std::variant<PcapngSpool::RecoveryResult, SpoolError>
recover_segment(const std::filesystem::path &path, bool truncate_partial_tail) {
  return scan_segment(path, truncate_partial_tail, {});
}

} // namespace pruftnet::capture::internal

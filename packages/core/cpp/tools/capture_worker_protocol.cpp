#include "tools/capture_worker_protocol.hpp"

#include <algorithm>
#include <array>
#include <charconv>
#include <istream>
#include <ostream>
#include <utility>

namespace pruftnet::capture_worker::protocol {
namespace {

std::optional<std::string> json_string_value(std::string_view json,
                                             std::size_t &pos) {
  if (pos >= json.size() || json[pos] != '"')
    return std::nullopt;
  std::string out;
  for (++pos; pos < json.size(); ++pos) {
    if (json[pos] == '"')
      return ++pos, out;
    if (json[pos] == '\\' && ++pos < json.size()) {
      if (json[pos] == 'b')
        out += '\b';
      else if (json[pos] == 'f')
        out += '\f';
      else if (json[pos] == 'n')
        out += '\n';
      else if (json[pos] == 'r')
        out += '\r';
      else if (json[pos] == 't')
        out += '\t';
      else if (json[pos] == 'u')
        return std::nullopt;
      else
        out += json[pos];
    } else
      out += json[pos];
  }
  return std::nullopt;
}

} // namespace

std::string json_string(std::string_view value) {
  std::string out = "\"";
  for (const char c : value) {
    switch (c) {
    case '\\':
      out += "\\\\";
      break;
    case '"':
      out += "\\\"";
      break;
    case '\n':
      out += "\\n";
      break;
    case '\r':
      out += "\\r";
      break;
    case '\t':
      out += "\\t";
      break;
    default:
      if (static_cast<unsigned char>(c) >= 0x20)
        out += c;
    }
  }
  return out + '"';
}

std::optional<std::string> field(std::string_view json, std::string_view key) {
  std::optional<std::string> found;
  std::size_t pos = 0;
  while (pos < json.size()) {
    pos = json.find('"', pos);
    if (pos == std::string_view::npos)
      break;
    const auto parsed_key = json_string_value(json, pos);
    if (!parsed_key)
      return std::nullopt;
    pos = json.find_first_not_of(" \t\r\n", pos);
    if (pos == std::string_view::npos || json[pos] != ':')
      continue;
    pos = json.find_first_not_of(" \t\r\n", pos + 1);
    if (pos == std::string_view::npos)
      return std::nullopt;

    std::optional<std::string> value;
    if (json[pos] == '"') {
      value = json_string_value(json, pos);
    } else {
      const auto end = json.find_first_of(",}", pos);
      auto raw = json.substr(pos, end - pos);
      while (!raw.empty() && (raw.back() == ' ' || raw.back() == '\t' ||
                              raw.back() == '\r' || raw.back() == '\n'))
        raw.remove_suffix(1);
      value = std::string(raw);
      pos = end == std::string_view::npos ? json.size() : end;
    }
    if (!value)
      return std::nullopt;
    if (*parsed_key == key) {
      if (found)
        return std::nullopt;
      found = std::move(value);
    }
  }
  return found;
}

std::optional<std::uint64_t> number(std::string_view json,
                                    std::string_view key) {
  const auto value = field(json, key);
  if (!value)
    return std::nullopt;
  std::uint64_t result = 0;
  const auto parsed =
      std::from_chars(value->data(), value->data() + value->size(), result);
  if (parsed.ec != std::errc{} || parsed.ptr != value->data() + value->size())
    return std::nullopt;
  return result;
}

std::optional<bool> boolean_field(std::string_view json, std::string_view key) {
  const auto value = field(json, key);
  if (value == "true")
    return true;
  if (value == "false")
    return false;
  return std::nullopt;
}

FrameRead read_frame(std::istream &input, std::string &payload) {
  std::array<unsigned char, 4> header{};
  input.read(reinterpret_cast<char *>(header.data()), header.size());
  if (input.gcount() == 0)
    return FrameRead::End;
  if (input.gcount() != static_cast<std::streamsize>(header.size()))
    return FrameRead::Truncated;
  const auto length =
      std::uint32_t(header[0]) | (std::uint32_t(header[1]) << 8U) |
      (std::uint32_t(header[2]) << 16U) | (std::uint32_t(header[3]) << 24U);
  if (length > kMaxRequestBytes) {
    std::array<char, 4096> discard{};
    std::uint32_t remaining = length;
    while (remaining != 0 && input) {
      const auto chunk = std::min<std::uint32_t>(remaining, discard.size());
      input.read(discard.data(), chunk);
      remaining -= static_cast<std::uint32_t>(input.gcount());
    }
    return remaining == 0 ? FrameRead::TooLarge : FrameRead::Truncated;
  }
  payload.resize(length);
  input.read(payload.data(), length);
  return input.gcount() == static_cast<std::streamsize>(length)
             ? FrameRead::Ok
             : FrameRead::Truncated;
}

void write_frame(std::ostream &output, std::string_view payload) {
  const auto length = static_cast<std::uint32_t>(payload.size());
  const std::array header{
      static_cast<unsigned char>(length & 0xffU),
      static_cast<unsigned char>((length >> 8U) & 0xffU),
      static_cast<unsigned char>((length >> 16U) & 0xffU),
      static_cast<unsigned char>((length >> 24U) & 0xffU),
  };
  output.write(reinterpret_cast<const char *>(header.data()), header.size());
  output.write(payload.data(), static_cast<std::streamsize>(payload.size()));
  output.flush();
}

} // namespace pruftnet::capture_worker::protocol

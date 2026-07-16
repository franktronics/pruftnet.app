#include "parsing/dissectors/dissector_utils.hpp"

#include <cstdint>

namespace pruftnet::parsing::internal {

std::string escaped_ascii(std::span<const std::byte> bytes) {
  constexpr char kHex[] = "0123456789abcdef";
  std::string value;
  value.reserve(bytes.size());
  for (const auto byte : bytes) {
    const auto character = std::to_integer<std::uint8_t>(byte);
    if (character >= 0x21 && character <= 0x7e && character != '\\') {
      value.push_back(static_cast<char>(character));
      continue;
    }
    value.push_back('\\');
    value.push_back('x');
    value.push_back(kHex[character >> 4U]);
    value.push_back(kHex[character & 0x0fU]);
  }
  return value;
}

bool internet_checksum_valid(std::span<const std::byte> bytes) noexcept {
  std::uint32_t sum = 0;
  std::size_t offset = 0;
  while (offset + 1 < bytes.size()) {
    sum += (static_cast<std::uint32_t>(
                std::to_integer<std::uint8_t>(bytes[offset]))
            << 8U) |
           std::to_integer<std::uint8_t>(bytes[offset + 1]);
    offset += 2;
  }
  if (offset < bytes.size()) {
    sum +=
        static_cast<std::uint32_t>(std::to_integer<std::uint8_t>(bytes[offset]))
        << 8U;
  }
  while ((sum >> 16U) != 0) {
    sum = (sum & 0xffffU) + (sum >> 16U);
  }
  return static_cast<std::uint16_t>(sum) == 0xffffU;
}

} // namespace pruftnet::parsing::internal

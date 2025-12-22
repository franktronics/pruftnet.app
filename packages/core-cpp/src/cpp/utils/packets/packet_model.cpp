#include "packet_model.hpp"
#include <cstdio>

RawPacket::RawPacket() : timestamp(std::chrono::system_clock::now()) {}

std::string RawPacket::toString() const {
  std::string result = "────────────────────────────────────────\n";
  result += "RawPacket\n";
  result += "length=" + std::to_string(length) + ", ";
  result += "original_length=" + std::to_string(original_length) + ", ";
  result += "valid=" + std::string(valid ? "true" : "false") + "\n";

  // Each line contains up to 11 bytes in hexadecimal format
  const size_t bytes_per_line = 11;
  for (size_t i = 0; i < length && i < MAX_PACKET_SIZE; i += bytes_per_line) {
    for (size_t j = 0; j < bytes_per_line && (i + j) < length; ++j) {
      if (j > 0) result += " ";

      // Hexadecimal format with 2 digits and zero padding
      uint8_t byte_val = data[i + j];
      char hex_str[3];
      snprintf(hex_str, sizeof(hex_str), "%02X", byte_val);
      result += hex_str;
    }
    result += "\n";
  }

  result += "────────────────────────────────────────\n";
  return result;
}

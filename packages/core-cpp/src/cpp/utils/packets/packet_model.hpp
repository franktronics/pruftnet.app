#pragma once

#include "../common/common.hpp"
#include <array>
#include <chrono>
#include <cstddef>
#include <cstdint>
#include <string>

struct RawPacket {
  std::array<uint8_t, MAX_PACKET_SIZE> data;
  size_t length = 0;
  size_t original_length = 0;
  std::chrono::system_clock::time_point timestamp;
  bool valid = false;

  // Constructor to set timestamp automatically
  RawPacket();
  std::string toString() const;
};

struct ParsedPacket {};

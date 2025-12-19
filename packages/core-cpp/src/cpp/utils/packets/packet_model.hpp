#pragma once

#include "../common/common.hpp"
#include "../protocols/protocol_types.hpp"
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

  RawPacket();
  std::string toString() const;
};

struct ParsedPacket {
  uint8_t protocol_count = 0;
  std::array<ProtocolEntry, MAX_PROTOCOLS_PER_PACKET> protocols;
  bool valid = false;
};

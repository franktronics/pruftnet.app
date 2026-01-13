#pragma once

#include "../common/common.hpp"
#include <array>
#include <chrono>
#include <cstddef>
#include <cstdint>
#include <string>
#include <napi.h>

struct RawPacket {
  std::array<uint8_t, MAX_PACKET_SIZE> data;
  size_t length = 0;
  std::chrono::system_clock::time_point timestamp;
  bool valid = false;

  RawPacket();
  std::string toString() const;
  Napi::Object toNapiObject(Napi::Env& env) const;
};


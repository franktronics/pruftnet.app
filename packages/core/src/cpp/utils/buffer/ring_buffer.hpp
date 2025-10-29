#pragma once

#include "../packets/packet_model.hpp"
#include "../common/common.hpp"
#include <atomic>
#include <cstddef>
#include <cstdint>
#include <cstring>

class RingBuffer {
public:
  RingBuffer();

  bool push(const uint8_t *src, size_t len);
  bool push(const RawPacket& packet);
  bool pop(RawPacket &out);

private:
  RawPacket buffer[RING_SIZE];
  size_t writeIndex;
  std::atomic<size_t> readIndex;
};

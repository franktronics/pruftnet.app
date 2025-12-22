#pragma once

#include "../common/common.hpp"
#include "../packets/packet_model.hpp"
#include <array>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstddef>
#include <cstdint>
#include <cstring>
#include <mutex>

class RingBuffer {
public:
  RingBuffer();

  bool push(const RawPacket& packet);
  bool pop(RawPacket& out);
  bool waitForData(std::chrono::milliseconds timeout);
  void notifyConsumer();

private:
  std::array<RawPacket, RING_SIZE> buffer_;
  std::atomic<size_t> write_index_;
  std::atomic<size_t> read_index_;

  std::mutex mutex_;
  std::condition_variable cv_;
};

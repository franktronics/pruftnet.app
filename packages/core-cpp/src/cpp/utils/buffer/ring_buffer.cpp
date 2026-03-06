#include "ring_buffer.hpp"

RingBuffer::RingBuffer() : write_index_(0), read_index_(0) {}

bool RingBuffer::push(const RawPacket& packet) {
  if (packet.length > MAX_PACKET_SIZE) return false;

  size_t current_write = write_index_.load(std::memory_order_relaxed);
  size_t next_write = (current_write + 1) % RING_SIZE;
  size_t current_read = read_index_.load(std::memory_order_acquire);

  if (next_write == current_read) {
    read_index_.store((current_read + 1) % RING_SIZE, std::memory_order_release);
  }

  buffer_[current_write] = packet;
  write_index_.store(next_write, std::memory_order_release);

  cv_.notify_one();
  return true;
}

bool RingBuffer::pop(RawPacket& out) {
  size_t current_read = read_index_.load(std::memory_order_acquire);
  size_t current_write = write_index_.load(std::memory_order_acquire);

  if (current_read == current_write) {
    return false;
  }

  const RawPacket& pkt = buffer_[current_read];
  if (!pkt.valid) return false;

  out = pkt;
  read_index_.store((current_read + 1) % RING_SIZE, std::memory_order_release);
  return true;
}

bool RingBuffer::waitForData(std::chrono::milliseconds timeout) {
  std::unique_lock<std::mutex> lock(mutex_);
  return cv_.wait_for(lock, timeout, [this] {
    return read_index_.load(std::memory_order_acquire) != write_index_.load(std::memory_order_acquire);
  });
}

void RingBuffer::notifyConsumer() {
  cv_.notify_one();
}

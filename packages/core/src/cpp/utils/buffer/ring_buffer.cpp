#include "ring_buffer.hpp"

RingBuffer::RingBuffer() : writeIndex(0), readIndex(0) {};

bool RingBuffer::push(const uint8_t *src, size_t len) {
  if (len > MAX_PACKET_SIZE)
    return false;

  size_t nextWrite = (writeIndex + 1) % RING_SIZE;

  if (nextWrite == readIndex.load(std::memory_order_acquire)) {
    // Overwrite if the buffer is full
    readIndex.store((readIndex + 1) % RING_SIZE, std::memory_order_release);
  }

  RawPacket &pkt = buffer[writeIndex];
  std::memcpy(pkt.data.data(), src, len);
  pkt.length = len;
  pkt.valid = true;

  writeIndex = nextWrite;
  return true;
}

bool RingBuffer::pop(RawPacket &out) {
  size_t currRead = readIndex.load(std::memory_order_acquire);

  if (currRead == writeIndex) {
    return false; // empty
  }

  RawPacket &pkt = buffer[currRead];
  if (!pkt.valid)
    return false;

  out = pkt;
  pkt.valid = false;

  readIndex.store((currRead + 1) % RING_SIZE, std::memory_order_release);
  return true;
}

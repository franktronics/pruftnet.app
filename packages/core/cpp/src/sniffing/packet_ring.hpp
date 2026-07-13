#pragma once

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <cstddef>
#include <cstdint>
#include <mutex>
#include <optional>
#include <span>
#include <vector>

#include "pruftnet/sniffing/packet.hpp"

namespace pruftnet::sniffing::internal {

struct QueuedPacketView {
  PacketMetadata metadata;
  std::span<const std::byte> bytes;
};

enum class PacketRingPushResult {
  Accepted,
  PacketCapacityReached,
  ByteCapacityReached,
  Oversize,
};

class PacketRing {
public:
  PacketRing(std::size_t capacity_packets, std::size_t capacity_bytes,
             std::size_t max_packet_size);

  PacketRing(const PacketRing &) = delete;
  PacketRing &operator=(const PacketRing &) = delete;

  PacketRingPushResult try_push(const PacketMetadata &metadata,
                                std::span<const std::byte> bytes) noexcept;
  std::optional<QueuedPacketView> peek() const noexcept;
  void pop() noexcept;

  [[nodiscard]] bool empty() const noexcept;
  [[nodiscard]] std::size_t depth() const noexcept;
  [[nodiscard]] std::size_t capacity() const noexcept;
  [[nodiscard]] std::size_t bytes() const noexcept;
  [[nodiscard]] std::size_t byte_capacity() const noexcept;

  void wait_for_data(std::chrono::milliseconds timeout);
  void notify_all() noexcept;

private:
  [[nodiscard]] std::size_t increment(std::size_t value) const noexcept;
  struct Descriptor {
    PacketMetadata metadata;
    std::size_t data_offset = 0;
    std::size_t length = 0;
    std::size_t reserved_bytes = 0;
  };

  const std::size_t capacity_;
  const std::size_t slot_count_;
  const std::size_t byte_capacity_;
  const std::size_t max_packet_size_;
  std::vector<Descriptor> descriptors_;
  std::vector<std::byte> data_;
  alignas(64) std::atomic<std::size_t> write_index_{0};
  alignas(64) std::atomic<std::size_t> read_index_{0};
  alignas(64) std::atomic<std::size_t> used_bytes_{0};
  std::size_t write_offset_ = 0;
  mutable std::mutex wait_mutex_;
  std::condition_variable data_available_;
};

} // namespace pruftnet::sniffing::internal

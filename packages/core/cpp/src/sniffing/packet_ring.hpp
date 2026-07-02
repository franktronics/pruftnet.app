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

class PacketRing {
public:
  PacketRing(std::size_t capacity, std::size_t max_packet_size);

  PacketRing(const PacketRing &) = delete;
  PacketRing &operator=(const PacketRing &) = delete;

  bool try_push(const PacketMetadata &metadata,
                std::span<const std::byte> bytes) noexcept;
  std::optional<QueuedPacketView> peek() const noexcept;
  void pop() noexcept;

  [[nodiscard]] bool empty() const noexcept;
  [[nodiscard]] std::size_t depth() const noexcept;
  [[nodiscard]] std::size_t capacity() const noexcept;

  void wait_for_data(std::chrono::milliseconds timeout);
  void notify_all() noexcept;

private:
  [[nodiscard]] std::size_t increment(std::size_t value) const noexcept;
  [[nodiscard]] std::byte *slot_data(std::size_t slot) noexcept;
  [[nodiscard]] const std::byte *slot_data(std::size_t slot) const noexcept;

  const std::size_t capacity_;
  const std::size_t slot_count_;
  const std::size_t max_packet_size_;
  std::vector<PacketMetadata> metadata_;
  std::vector<std::uint32_t> lengths_;
  std::vector<std::byte> data_;
  alignas(64) std::atomic<std::size_t> write_index_{0};
  alignas(64) std::atomic<std::size_t> read_index_{0};
  mutable std::mutex wait_mutex_;
  std::condition_variable data_available_;
};

} // namespace pruftnet::sniffing::internal

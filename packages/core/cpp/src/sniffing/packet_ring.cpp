#include "sniffing/packet_ring.hpp"

#include <cstring>
#include <limits>
#include <stdexcept>

namespace pruftnet::sniffing::internal {
namespace {

std::size_t checked_slot_count(std::size_t capacity) {
    if (capacity == 0) {
        throw std::invalid_argument("PacketRing capacity must be greater than zero.");
    }
    if (capacity == std::numeric_limits<std::size_t>::max()) {
        throw std::invalid_argument("PacketRing capacity is too large.");
    }
    return capacity + 1;
}

std::size_t checked_packet_size(std::size_t max_packet_size) {
    if (max_packet_size == 0) {
        throw std::invalid_argument("PacketRing max packet size must be greater than zero.");
    }
    return max_packet_size;
}

std::size_t checked_byte_capacity(std::size_t capacity) {
    if (capacity == 0) {
        throw std::invalid_argument("PacketRing byte capacity must be greater than zero.");
    }
    return capacity;
}

} // namespace

PacketRing::PacketRing(std::size_t capacity_packets, std::size_t capacity_bytes,
                       std::size_t max_packet_size)
    : capacity_(capacity_packets),
      slot_count_(checked_slot_count(capacity_packets)),
      byte_capacity_(checked_byte_capacity(capacity_bytes)),
      max_packet_size_(checked_packet_size(max_packet_size)),
      descriptors_(slot_count_), data_(byte_capacity_) {}

PacketRingPushResult PacketRing::try_push(const PacketMetadata& metadata,
                                          std::span<const std::byte> bytes) noexcept {
    if (bytes.size() > max_packet_size_ || bytes.size() > byte_capacity_) {
        return PacketRingPushResult::Oversize;
    }

    const auto write = write_index_.load(std::memory_order_relaxed);
    const auto next = increment(write);
    if (next == read_index_.load(std::memory_order_acquire)) {
        return PacketRingPushResult::PacketCapacityReached;
    }

    const auto used = used_bytes_.load(std::memory_order_acquire);
    if (used == 0) {
        write_offset_ = 0;
    }

    const auto tail = byte_capacity_ - write_offset_;
    const auto padding = bytes.size() > tail ? tail : 0;
    const auto required = padding + bytes.size();
    if (required > byte_capacity_ - used) {
        return PacketRingPushResult::ByteCapacityReached;
    }
    if (padding != 0) {
        write_offset_ = 0;
    }

    auto& descriptor = descriptors_[write];
    descriptor.metadata = metadata;
    descriptor.data_offset = write_offset_;
    descriptor.length = bytes.size();
    descriptor.reserved_bytes = required;
    if (!bytes.empty()) {
        std::memcpy(data_.data() + write_offset_, bytes.data(), bytes.size());
    }
    write_offset_ += bytes.size();
    if (write_offset_ == byte_capacity_) write_offset_ = 0;

    used_bytes_.fetch_add(required, std::memory_order_release);
    write_index_.store(next, std::memory_order_release);
    data_available_.notify_one();
    return PacketRingPushResult::Accepted;
}

std::optional<QueuedPacketView> PacketRing::peek() const noexcept {
    const auto read = read_index_.load(std::memory_order_relaxed);
    if (read == write_index_.load(std::memory_order_acquire)) {
        return std::nullopt;
    }

    QueuedPacketView view;
    const auto& descriptor = descriptors_[read];
    view.metadata = descriptor.metadata;
    view.bytes = std::span<const std::byte>(data_.data() + descriptor.data_offset,
                                           descriptor.length);
    return view;
}

void PacketRing::pop() noexcept {
    const auto read = read_index_.load(std::memory_order_relaxed);
    if (read == write_index_.load(std::memory_order_acquire)) {
        return;
    }

    const auto reserved = descriptors_[read].reserved_bytes;
    read_index_.store(increment(read), std::memory_order_release);
    used_bytes_.fetch_sub(reserved, std::memory_order_release);
}

bool PacketRing::empty() const noexcept {
    return read_index_.load(std::memory_order_acquire) ==
           write_index_.load(std::memory_order_acquire);
}

std::size_t PacketRing::depth() const noexcept {
    const auto read = read_index_.load(std::memory_order_acquire);
    const auto write = write_index_.load(std::memory_order_acquire);
    if (write >= read) {
        return write - read;
    }
    return slot_count_ - read + write;
}

std::size_t PacketRing::capacity() const noexcept {
    return capacity_;
}

std::size_t PacketRing::bytes() const noexcept {
    return used_bytes_.load(std::memory_order_acquire);
}

std::size_t PacketRing::byte_capacity() const noexcept { return byte_capacity_; }

void PacketRing::wait_for_data(std::chrono::milliseconds timeout) {
    std::unique_lock lock(wait_mutex_);
    data_available_.wait_for(lock, timeout);
}

void PacketRing::notify_all() noexcept {
    data_available_.notify_all();
}

std::size_t PacketRing::increment(std::size_t value) const noexcept {
    ++value;
    if (value == slot_count_) {
        return 0;
    }
    return value;
}

} // namespace pruftnet::sniffing::internal

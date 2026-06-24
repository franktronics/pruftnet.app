#include "pruftnet/capture/packet_ring.hpp"

#include <algorithm>
#include <cstring>
#include <limits>
#include <stdexcept>

namespace pruftnet::capture {
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

std::size_t checked_data_size(std::size_t slot_count, std::size_t max_packet_size) {
    if (slot_count > std::numeric_limits<std::size_t>::max() / max_packet_size) {
        throw std::invalid_argument("PacketRing requested byte storage is too large.");
    }

    return slot_count * max_packet_size;
}

} // namespace

PacketRing::PacketRing(std::size_t capacity, std::size_t max_packet_size)
    : capacity_(capacity),
      slot_count_(checked_slot_count(capacity)),
      max_packet_size_(checked_packet_size(max_packet_size)),
      records_(slot_count_),
      lengths_(slot_count_, 0),
      data_(checked_data_size(slot_count_, max_packet_size_)) {}

bool PacketRing::try_push(const PacketRecord& record, std::span<const std::byte> bytes) noexcept {
    if (bytes.size() > max_packet_size_) {
        return false;
    }

    const auto write = write_index_.load(std::memory_order_relaxed);
    const auto next = increment(write);

    if (next == read_index_.load(std::memory_order_acquire)) {
        return false;
    }

    records_[write] = record;
    lengths_[write] = static_cast<std::uint32_t>(bytes.size());
    if (!bytes.empty()) {
        std::memcpy(slot_data(write), bytes.data(), bytes.size());
    }

    write_index_.store(next, std::memory_order_release);
    data_available_.notify_one();
    return true;
}

std::optional<PacketView> PacketRing::peek() const noexcept {
    const auto read = read_index_.load(std::memory_order_relaxed);
    if (read == write_index_.load(std::memory_order_acquire)) {
        return std::nullopt;
    }

    PacketView view;
    view.record = records_[read];
    view.bytes = std::span<const std::byte>(slot_data(read), lengths_[read]);
    return view;
}

void PacketRing::pop() noexcept {
    const auto read = read_index_.load(std::memory_order_relaxed);
    if (read == write_index_.load(std::memory_order_acquire)) {
        return;
    }

    read_index_.store(increment(read), std::memory_order_release);
}

bool PacketRing::empty() const noexcept {
    return read_index_.load(std::memory_order_acquire) ==
           write_index_.load(std::memory_order_acquire);
}

bool PacketRing::full() const noexcept {
    return increment(write_index_.load(std::memory_order_acquire)) ==
           read_index_.load(std::memory_order_acquire);
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

std::size_t PacketRing::max_packet_size() const noexcept {
    return max_packet_size_;
}

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

std::byte* PacketRing::slot_data(std::size_t slot) noexcept {
    return data_.data() + slot * max_packet_size_;
}

const std::byte* PacketRing::slot_data(std::size_t slot) const noexcept {
    return data_.data() + slot * max_packet_size_;
}

} // namespace pruftnet::capture

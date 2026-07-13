#include "sniffing/internal_stats.hpp"

#include <utility>

namespace pruftnet::sniffing::internal {

void InternalStats::reset() noexcept {
    packets_observed_.store(0, std::memory_order_relaxed);
    capture_queue_accepted_.store(0, std::memory_order_relaxed);
    capture_queue_full_drops_.store(0, std::memory_order_relaxed);
    capture_queue_oversize_drops_.store(0, std::memory_order_relaxed);
    invalid_callback_drops_.store(0, std::memory_order_relaxed);
    pcap_dispatch_calls_.store(0, std::memory_order_relaxed);
    pcap_dispatch_errors_.store(0, std::memory_order_relaxed);
    pcap_stats_read_failures_.store(0, std::memory_order_relaxed);
    pcap_recv_.store(0, std::memory_order_relaxed);
    pcap_drop_.store(0, std::memory_order_relaxed);
    pcap_ifdrop_.store(0, std::memory_order_relaxed);
    capture_queue_max_depth_.store(0, std::memory_order_relaxed);
    capture_queue_max_bytes_.store(0, std::memory_order_relaxed);
}

void InternalStats::increment_packets_observed(std::uint64_t value) noexcept {
    packets_observed_.fetch_add(value, std::memory_order_relaxed);
}

void InternalStats::increment_capture_queue_accepted(std::uint64_t value) noexcept {
    capture_queue_accepted_.fetch_add(value, std::memory_order_relaxed);
}

void InternalStats::increment_capture_queue_full_drops(std::uint64_t value) noexcept {
    capture_queue_full_drops_.fetch_add(value, std::memory_order_relaxed);
}

void InternalStats::increment_capture_queue_oversize_drops(std::uint64_t value) noexcept {
    capture_queue_oversize_drops_.fetch_add(value, std::memory_order_relaxed);
}

void InternalStats::increment_invalid_callback_drops(std::uint64_t value) noexcept {
    invalid_callback_drops_.fetch_add(value, std::memory_order_relaxed);
}

void InternalStats::increment_pcap_dispatch_calls(std::uint64_t value) noexcept {
    pcap_dispatch_calls_.fetch_add(value, std::memory_order_relaxed);
}

void InternalStats::increment_pcap_dispatch_errors(std::uint64_t value) noexcept {
    pcap_dispatch_errors_.fetch_add(value, std::memory_order_relaxed);
}

void InternalStats::increment_pcap_stats_read_failures(std::uint64_t value) noexcept {
    pcap_stats_read_failures_.fetch_add(value, std::memory_order_relaxed);
}

void InternalStats::set_kernel_stats(
    std::uint64_t recv,
    std::uint64_t drop,
    std::uint64_t ifdrop) noexcept {
    pcap_recv_.store(recv, std::memory_order_relaxed);
    pcap_drop_.store(drop, std::memory_order_relaxed);
    pcap_ifdrop_.store(ifdrop, std::memory_order_relaxed);
}

void InternalStats::observe_capture_queue(std::size_t depth, std::size_t bytes) noexcept {
    auto current = capture_queue_max_depth_.load(std::memory_order_relaxed);
    while (depth > current &&
           !capture_queue_max_depth_.compare_exchange_weak(
               current,
               depth,
               std::memory_order_relaxed,
               std::memory_order_relaxed)) {
    }
    current = capture_queue_max_bytes_.load(std::memory_order_relaxed);
    while (bytes > current &&
           !capture_queue_max_bytes_.compare_exchange_weak(
               current, bytes, std::memory_order_relaxed,
               std::memory_order_relaxed)) {
    }
}

InterfaceStatsSnapshot InternalStats::snapshot(
    std::uint32_t interface_id,
    std::string interface_name,
    int link_type,
    std::size_t queue_depth,
    std::size_t queue_capacity_packets,
    std::size_t queue_bytes,
    std::size_t queue_capacity_bytes,
    bool capture_thread_running) const {
    InterfaceStatsSnapshot snapshot;
    snapshot.interface_id = interface_id;
    snapshot.interface_name = std::move(interface_name);
    snapshot.link_type = link_type;
    snapshot.packets_observed = packets_observed_.load(std::memory_order_relaxed);
    snapshot.capture_queue_accepted = capture_queue_accepted_.load(std::memory_order_relaxed);
    snapshot.capture_queue_full_drops = capture_queue_full_drops_.load(std::memory_order_relaxed);
    snapshot.capture_queue_oversize_drops = capture_queue_oversize_drops_.load(std::memory_order_relaxed);
    snapshot.invalid_callback_drops = invalid_callback_drops_.load(std::memory_order_relaxed);
    snapshot.pcap_dispatch_calls = pcap_dispatch_calls_.load(std::memory_order_relaxed);
    snapshot.pcap_dispatch_errors = pcap_dispatch_errors_.load(std::memory_order_relaxed);
    snapshot.pcap_stats_read_failures = pcap_stats_read_failures_.load(std::memory_order_relaxed);
    snapshot.pcap_received = pcap_recv_.load(std::memory_order_relaxed);
    snapshot.pcap_kernel_drops = pcap_drop_.load(std::memory_order_relaxed);
    snapshot.pcap_interface_drops = pcap_ifdrop_.load(std::memory_order_relaxed);
    snapshot.capture_queue_depth = queue_depth;
    snapshot.capture_queue_capacity_packets = queue_capacity_packets;
    snapshot.capture_queue_bytes = queue_bytes;
    snapshot.capture_queue_capacity_bytes = queue_capacity_bytes;
    snapshot.capture_queue_max_depth = capture_queue_max_depth_.load(std::memory_order_relaxed);
    snapshot.capture_queue_max_bytes = capture_queue_max_bytes_.load(std::memory_order_relaxed);
    snapshot.capture_thread_running = capture_thread_running;
    return snapshot;
}

} // namespace pruftnet::sniffing::internal

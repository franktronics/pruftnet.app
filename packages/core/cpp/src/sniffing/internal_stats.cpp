#include "sniffing/internal_stats.hpp"

namespace pruftnet::sniffing::internal {

void InternalStats::reset() noexcept {
    packets_seen_.store(0, std::memory_order_relaxed);
    packets_enqueued_.store(0, std::memory_order_relaxed);
    packets_parsed_.store(0, std::memory_order_relaxed);
    app_ring_drops_.store(0, std::memory_order_relaxed);
    pcap_dispatch_calls_.store(0, std::memory_order_relaxed);
    pcap_dispatch_errors_.store(0, std::memory_order_relaxed);
    pcap_recv_.store(0, std::memory_order_relaxed);
    pcap_drop_.store(0, std::memory_order_relaxed);
    pcap_ifdrop_.store(0, std::memory_order_relaxed);
    max_ring_depth_.store(0, std::memory_order_relaxed);
}

void InternalStats::increment_packets_seen(std::uint64_t value) noexcept {
    packets_seen_.fetch_add(value, std::memory_order_relaxed);
}

void InternalStats::increment_packets_enqueued(std::uint64_t value) noexcept {
    packets_enqueued_.fetch_add(value, std::memory_order_relaxed);
}

void InternalStats::increment_packets_parsed(std::uint64_t value) noexcept {
    packets_parsed_.fetch_add(value, std::memory_order_relaxed);
}

void InternalStats::increment_app_ring_drops(std::uint64_t value) noexcept {
    app_ring_drops_.fetch_add(value, std::memory_order_relaxed);
}

void InternalStats::increment_pcap_dispatch_calls(std::uint64_t value) noexcept {
    pcap_dispatch_calls_.fetch_add(value, std::memory_order_relaxed);
}

void InternalStats::increment_pcap_dispatch_errors(std::uint64_t value) noexcept {
    pcap_dispatch_errors_.fetch_add(value, std::memory_order_relaxed);
}

void InternalStats::set_kernel_stats(
    std::uint64_t recv,
    std::uint64_t drop,
    std::uint64_t ifdrop) noexcept {
    pcap_recv_.store(recv, std::memory_order_relaxed);
    pcap_drop_.store(drop, std::memory_order_relaxed);
    pcap_ifdrop_.store(ifdrop, std::memory_order_relaxed);
}

void InternalStats::observe_ring_depth(std::size_t depth) noexcept {
    auto current = max_ring_depth_.load(std::memory_order_relaxed);
    while (depth > current &&
           !max_ring_depth_.compare_exchange_weak(
               current,
               depth,
               std::memory_order_relaxed,
               std::memory_order_relaxed)) {
    }
}

SnifferStatsSnapshot InternalStats::snapshot(
    std::size_t ring_depth,
    std::size_t ring_capacity,
    bool capture_thread_running,
    bool parser_thread_running) const noexcept {
    SnifferStatsSnapshot snapshot;
    snapshot.packets_seen = packets_seen_.load(std::memory_order_relaxed);
    snapshot.packets_enqueued = packets_enqueued_.load(std::memory_order_relaxed);
    snapshot.packets_parsed = packets_parsed_.load(std::memory_order_relaxed);
    snapshot.app_ring_drops = app_ring_drops_.load(std::memory_order_relaxed);
    snapshot.pcap_dispatch_calls = pcap_dispatch_calls_.load(std::memory_order_relaxed);
    snapshot.pcap_dispatch_errors = pcap_dispatch_errors_.load(std::memory_order_relaxed);
    snapshot.pcap_recv = pcap_recv_.load(std::memory_order_relaxed);
    snapshot.pcap_drop = pcap_drop_.load(std::memory_order_relaxed);
    snapshot.pcap_ifdrop = pcap_ifdrop_.load(std::memory_order_relaxed);
    snapshot.ring_depth = ring_depth;
    snapshot.ring_capacity = ring_capacity;
    snapshot.max_ring_depth = max_ring_depth_.load(std::memory_order_relaxed);
    snapshot.capture_thread_running = capture_thread_running;
    snapshot.parser_thread_running = parser_thread_running;
    return snapshot;
}

} // namespace pruftnet::sniffing::internal

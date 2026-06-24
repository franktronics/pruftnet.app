#pragma once

#include <atomic>
#include <cstddef>
#include <cstdint>

namespace pruftnet::capture {

struct CaptureStatsSnapshot {
    std::uint64_t packets_seen = 0;
    std::uint64_t packets_enqueued = 0;
    std::uint64_t packets_parsed = 0;
    std::uint64_t app_ring_drops = 0;
    std::uint64_t pcap_dispatch_calls = 0;
    std::uint64_t pcap_dispatch_errors = 0;
    std::uint64_t pcap_recv = 0;
    std::uint64_t pcap_drop = 0;
    std::uint64_t pcap_ifdrop = 0;
    std::size_t ring_depth = 0;
    std::size_t ring_capacity = 0;
    std::size_t max_ring_depth = 0;
    bool capture_thread_running = false;
    bool parser_thread_running = false;
};

class CaptureStats {
public:
    void increment_packets_seen(std::uint64_t value = 1) noexcept;
    void increment_packets_enqueued(std::uint64_t value = 1) noexcept;
    void increment_packets_parsed(std::uint64_t value = 1) noexcept;
    void increment_app_ring_drops(std::uint64_t value = 1) noexcept;
    void increment_pcap_dispatch_calls(std::uint64_t value = 1) noexcept;
    void increment_pcap_dispatch_errors(std::uint64_t value = 1) noexcept;
    void set_kernel_stats(std::uint64_t recv, std::uint64_t drop, std::uint64_t ifdrop) noexcept;
    void observe_ring_depth(std::size_t depth) noexcept;

    CaptureStatsSnapshot snapshot(
        std::size_t ring_depth,
        std::size_t ring_capacity,
        bool capture_thread_running,
        bool parser_thread_running) const noexcept;

private:
    std::atomic<std::uint64_t> packets_seen_{0};
    std::atomic<std::uint64_t> packets_enqueued_{0};
    std::atomic<std::uint64_t> packets_parsed_{0};
    std::atomic<std::uint64_t> app_ring_drops_{0};
    std::atomic<std::uint64_t> pcap_dispatch_calls_{0};
    std::atomic<std::uint64_t> pcap_dispatch_errors_{0};
    std::atomic<std::uint64_t> pcap_recv_{0};
    std::atomic<std::uint64_t> pcap_drop_{0};
    std::atomic<std::uint64_t> pcap_ifdrop_{0};
    std::atomic<std::size_t> max_ring_depth_{0};
};

} // namespace pruftnet::capture

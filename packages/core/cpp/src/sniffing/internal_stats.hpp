#pragma once

#include <atomic>
#include <cstddef>
#include <cstdint>
#include <string>

#include "pruftnet/sniffing/sniffer_stats.hpp"

namespace pruftnet::sniffing::internal {

class InternalStats {
public:
    void reset() noexcept;
    void increment_packets_observed(std::uint64_t value = 1) noexcept;
    void increment_capture_queue_accepted(std::uint64_t value = 1) noexcept;
    void increment_capture_queue_full_drops(std::uint64_t value = 1) noexcept;
    void increment_capture_queue_oversize_drops(std::uint64_t value = 1) noexcept;
    void increment_invalid_callback_drops(std::uint64_t value = 1) noexcept;
    void increment_pcap_dispatch_calls(std::uint64_t value = 1) noexcept;
    void increment_pcap_dispatch_errors(std::uint64_t value = 1) noexcept;
    void increment_pcap_stats_read_failures(std::uint64_t value = 1) noexcept;
    void set_kernel_stats(std::uint64_t recv, std::uint64_t drop, std::uint64_t ifdrop) noexcept;
    void observe_capture_queue(std::size_t depth, std::size_t bytes) noexcept;

    [[nodiscard]] InterfaceStatsSnapshot snapshot(
        std::uint32_t interface_id,
        std::string interface_name,
        int link_type,
        std::size_t queue_depth,
        std::size_t queue_capacity_packets,
        std::size_t queue_bytes,
        std::size_t queue_capacity_bytes,
        bool capture_thread_running) const;

private:
    std::atomic<std::uint64_t> packets_observed_{0};
    std::atomic<std::uint64_t> capture_queue_accepted_{0};
    std::atomic<std::uint64_t> capture_queue_full_drops_{0};
    std::atomic<std::uint64_t> capture_queue_oversize_drops_{0};
    std::atomic<std::uint64_t> invalid_callback_drops_{0};
    std::atomic<std::uint64_t> pcap_dispatch_calls_{0};
    std::atomic<std::uint64_t> pcap_dispatch_errors_{0};
    std::atomic<std::uint64_t> pcap_stats_read_failures_{0};
    std::atomic<std::uint64_t> pcap_recv_{0};
    std::atomic<std::uint64_t> pcap_drop_{0};
    std::atomic<std::uint64_t> pcap_ifdrop_{0};
    std::atomic<std::size_t> capture_queue_max_depth_{0};
    std::atomic<std::size_t> capture_queue_max_bytes_{0};
};

} // namespace pruftnet::sniffing::internal

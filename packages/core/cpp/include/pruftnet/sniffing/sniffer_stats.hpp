#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

namespace pruftnet::sniffing {

struct InterfaceStatsSnapshot {
    std::uint32_t interface_id = 0;
    std::string interface_name;
    int link_type = 0;
    std::uint64_t packets_observed = 0;
    std::uint64_t capture_queue_accepted = 0;
    std::uint64_t capture_queue_full_drops = 0;
    std::uint64_t capture_queue_oversize_drops = 0;
    std::uint64_t invalid_callback_drops = 0;
    std::uint64_t pcap_dispatch_calls = 0;
    std::uint64_t pcap_dispatch_errors = 0;
    std::uint64_t pcap_received = 0;
    std::uint64_t pcap_kernel_drops = 0;
    std::uint64_t pcap_interface_drops = 0;
    std::uint64_t pcap_stats_read_failures = 0;
    std::size_t capture_queue_depth = 0;
    std::size_t capture_queue_capacity_packets = 0;
    std::size_t capture_queue_capacity_bytes = 0;
    std::size_t capture_queue_bytes = 0;
    std::size_t capture_queue_max_depth = 0;
    std::size_t capture_queue_max_bytes = 0;
    bool capture_thread_running = false;
};

struct SnifferStatsSnapshot {
    std::vector<InterfaceStatsSnapshot> interfaces;
    std::uint64_t packets_observed = 0;
    std::uint64_t capture_queue_accepted = 0;
    std::uint64_t capture_queue_full_drops = 0;
    std::uint64_t capture_queue_oversize_drops = 0;
    std::uint64_t invalid_callback_drops = 0;
    std::uint64_t pcap_dispatch_calls = 0;
    std::uint64_t pcap_dispatch_errors = 0;
    std::uint64_t pcap_received = 0;
    std::uint64_t pcap_kernel_drops = 0;
    std::uint64_t pcap_interface_drops = 0;
    std::uint64_t pcap_stats_read_failures = 0;
    std::size_t capture_queue_depth = 0;
    std::size_t capture_queue_capacity_packets = 0;
    std::size_t capture_queue_capacity_bytes = 0;
    std::size_t capture_queue_bytes = 0;
    std::size_t capture_queue_max_depth = 0;
    std::size_t capture_queue_max_bytes = 0;
    std::uint64_t packets_persisted = 0;
    std::uint64_t spool_bytes_written = 0;
    std::uint64_t spool_bytes_retained = 0;
    std::uint64_t spool_quota_bytes = 0;
    std::uint64_t spool_evicted_packets = 0;
    std::uint64_t spool_evicted_bytes = 0;
    std::uint64_t spool_write_failures = 0;
    std::uint64_t spool_flush_failures = 0;
    std::uint64_t last_committed_packet_id = 0;
    std::uint64_t writer_in_flight = 0;
    std::uint64_t terminal_write_losses = 0;
    std::size_t spool_segments = 0;
    std::uint64_t packets_available_for_analysis = 0;
    std::uint64_t packets_analyzed = 0;
    std::uint64_t analysis_backlog_packets = 0;
    std::uint64_t analysis_backlog_bytes = 0;
    std::uint64_t analysis_errors = 0;
    std::uint64_t analysis_resource_limits = 0;
    std::uint64_t analysis_gap_count = 0;
    std::uint64_t analysis_evicted_before_analysis = 0;
    std::uint64_t analysis_rejects = 0;
    bool writer_thread_running = false;
    bool analyzer_running = false;
};

} // namespace pruftnet::sniffing

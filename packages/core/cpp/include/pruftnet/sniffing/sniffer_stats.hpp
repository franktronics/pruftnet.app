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
};

struct SnifferStatsSnapshot {
    std::vector<InterfaceStatsSnapshot> interfaces;
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
    bool parser_thread_running = false;
};

} // namespace pruftnet::sniffing

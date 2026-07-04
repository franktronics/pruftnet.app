#pragma once

#include <chrono>
#include <cstddef>
#include <cstdint>
#include <limits>
#include <optional>
#include <string>
#include <vector>

namespace pruftnet::sniffing {

std::vector<int> default_supported_link_types();

inline constexpr std::uint32_t kAutoInterfaceId = std::numeric_limits<std::uint32_t>::max();

struct SnifferInterfaceOptions {
    std::string name;
    std::uint32_t id = kAutoInterfaceId;
    bool promiscuous = false;
    bool monitor_mode = false;
    int snaplen = 512;
    int pcap_buffer_size_bytes = 64 * 1024 * 1024;
    int read_timeout_ms = 10;
    int pcap_dispatch_batch_size = 64;
    std::size_t ring_slots = 65'536;
    std::string bpf_filter;
    bool bpf_optimize = true;
    std::optional<int> requested_link_type;
    std::optional<std::string> timestamp_type;
};

struct SnifferOptions {
    SnifferOptions();

    std::vector<SnifferInterfaceOptions> interfaces;
    std::vector<int> accepted_link_types;
    std::chrono::milliseconds stats_poll_interval = std::chrono::milliseconds(1'000);
    std::size_t max_total_ring_bytes = 0;
};

} // namespace pruftnet::sniffing

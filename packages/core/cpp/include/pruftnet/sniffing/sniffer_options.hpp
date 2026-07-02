#pragma once

#include <chrono>
#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

namespace pruftnet::sniffing {

std::vector<int> default_supported_link_types();

struct SnifferOptions {
    SnifferOptions();

    std::string interface_name;
    std::uint32_t interface_id = 0;
    bool promiscuous = false;
    int snaplen = 512;
    int pcap_buffer_size_bytes = 64 * 1024 * 1024;
    int read_timeout_ms = 10;
    int pcap_dispatch_batch_size = 64;
    std::size_t ring_slots = 65'536;
    std::string bpf_filter;
    std::vector<int> accepted_link_types;
    std::chrono::milliseconds stats_poll_interval = std::chrono::milliseconds(1'000);
};

} // namespace pruftnet::sniffing

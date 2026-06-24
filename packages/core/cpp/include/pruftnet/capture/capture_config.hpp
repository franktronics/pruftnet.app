#pragma once

#include <chrono>
#include <cstddef>
#include <cstdint>
#include <optional>
#include <string>
#include <vector>

namespace pruftnet::capture {

enum class DropPolicy {
    DropNewest,
};

enum class UnsupportedLinkTypePolicy {
    Fail,
    CaptureRaw,
};

enum class CaptureDirection {
    InOut,
    InOnly,
    OutOnly,
};

struct CaptureConfig {
    std::string interface_name;
    std::uint32_t interface_id = 0;
    bool promiscuous = false;
    bool monitor_mode = false;
    bool immediate_mode = false;
    bool prefer_nanosecond_timestamps = true;
    int snaplen = 512;
    int pcap_buffer_size_bytes = 64 * 1024 * 1024;
    int read_timeout_ms = 10;
    int dispatch_batch_size = 64;
    std::string bpf_filter;
    std::vector<int> accepted_link_types;
    UnsupportedLinkTypePolicy unsupported_link_type_policy = UnsupportedLinkTypePolicy::Fail;
    DropPolicy drop_policy = DropPolicy::DropNewest;
    CaptureDirection direction = CaptureDirection::InOut;
    std::size_t ring_slots = 65'536;
    std::chrono::milliseconds stats_interval = std::chrono::milliseconds(1'000);
    std::optional<std::uint64_t> max_packets;
};

} // namespace pruftnet::capture

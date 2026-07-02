#pragma once

#include <cstddef>
#include <cstdint>
#include <span>

namespace pruftnet::sniffing {

enum PacketFlags : std::uint32_t {
    PacketFlagNone = 0,
    PacketFlagTruncated = 1U << 0U,
};

struct PacketMetadata {
    std::uint64_t sequence = 0;
    std::uint64_t timestamp_ns = 0;
    std::uint32_t interface_id = 0;
    std::uint32_t captured_len = 0;
    std::uint32_t wire_len = 0;
    std::uint32_t link_type = 0;
    std::uint32_t flags = PacketFlagNone;
};

struct RawPacketView {
    PacketMetadata metadata;
    std::span<const std::byte> bytes;
};

} // namespace pruftnet::sniffing

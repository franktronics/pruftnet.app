#pragma once

#include <cstdint>

namespace pruftnet::capture {

enum PacketFlags : std::uint32_t {
    PacketFlagNone = 0,
    PacketFlagTruncated = 1U << 0U,
    PacketFlagUnsupportedLinkType = 1U << 1U,
};

struct PacketRecord {
    std::uint64_t sequence = 0;
    std::uint64_t timestamp_ns = 0;
    std::uint32_t interface_id = 0;
    std::uint32_t captured_len = 0;
    std::uint32_t wire_len = 0;
    std::uint32_t link_type = 0;
    std::uint32_t flags = PacketFlagNone;
};

} // namespace pruftnet::capture

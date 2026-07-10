#pragma once

#include <cstddef>
#include <cstdint>
#include <span>

namespace pruftnet::sniffing {

enum PacketFlags : std::uint32_t {
    PacketFlagNone = 0,
    PacketFlagTruncated = 1U << 0U,
};

struct CaptureId {
    std::uint64_t high = 0;
    std::uint64_t low = 0;

    [[nodiscard]] constexpr bool is_nil() const noexcept {
        return high == 0 && low == 0;
    }

    friend constexpr bool operator==(const CaptureId&, const CaptureId&) = default;
};

using PacketId = std::uint64_t;

struct PacketKey {
    CaptureId capture_id;
    PacketId packet_id = 0;

    friend constexpr bool operator==(const PacketKey&, const PacketKey&) = default;
};

struct PacketMetadata {
    PacketKey key;
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

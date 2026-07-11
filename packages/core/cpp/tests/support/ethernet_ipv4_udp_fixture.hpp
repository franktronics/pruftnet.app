#pragma once

#include <cstddef>
#include <cstdint>
#include <initializer_list>
#include <span>
#include <vector>

#include "pruftnet/sniffing/packet.hpp"

namespace pruftnet::tests {

inline void append_packet_bytes(std::vector<std::byte>& bytes, std::initializer_list<std::uint8_t> values) {
    for (const auto value : values) {
        bytes.push_back(static_cast<std::byte>(value));
    }
}

inline std::vector<std::byte> ethernet_ipv4_udp_packet(std::span<const std::byte> payload = {}) {
    const auto udp_length = static_cast<std::uint16_t>(8 + payload.size());
    const auto ip_length = static_cast<std::uint16_t>(20 + udp_length);
    std::vector<std::byte> bytes;
    bytes.reserve(14 + ip_length);
    append_packet_bytes(bytes, {
                                   0x00,
                                   0x11,
                                   0x22,
                                   0x33,
                                   0x44,
                                   0x55,
                                   0x66,
                                   0x77,
                                   0x88,
                                   0x99,
                                   0xaa,
                                   0xbb,
                                   0x08,
                                   0x00,
                                   0x45,
                                   0x2e,
                                   static_cast<std::uint8_t>(ip_length >> 8U),
                                   static_cast<std::uint8_t>(ip_length),
                                   0x12,
                                   0x34,
                                   0x40,
                                   0x00,
                                   0x40,
                                   0x11,
                                   0xab,
                                   0xcd,
                                   192,
                                   0,
                                   2,
                                   10,
                                   198,
                                   51,
                                   100,
                                   20,
                                   0x9c,
                                   0x41,
                                   0x13,
                                   0x89,
                                   static_cast<std::uint8_t>(udp_length >> 8U),
                                   static_cast<std::uint8_t>(udp_length),
                                   0x45,
                                   0x67,
                               });
    bytes.insert(bytes.end(), payload.begin(), payload.end());
    return bytes;
}

inline sniffing::RawPacketView raw_packet_view(std::span<const std::byte> bytes, std::uint32_t wire_length,
                                               std::uint32_t link_type = 1,
                                               std::uint32_t flags = sniffing::PacketFlagNone) {
    return sniffing::RawPacketView{
        .metadata =
            {
                .key = {.capture_id = {.high = 1, .low = 2}, .packet_id = 1},
                .captured_len = static_cast<std::uint32_t>(bytes.size()),
                .wire_len = wire_length,
                .link_type = link_type,
                .flags = flags,
            },
        .bytes = bytes,
    };
}

} // namespace pruftnet::tests

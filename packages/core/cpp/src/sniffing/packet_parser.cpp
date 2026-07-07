#include "sniffing/packet_parser.hpp"

#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <limits>

#include <pcap/pcap.h>

#include "sniffing/packet_cursor.hpp"

namespace pruftnet::sniffing::internal {
namespace {

constexpr std::size_t kEthernetHeaderLen = 14;
constexpr std::size_t kIpv4MinHeaderLen = 20;
constexpr std::size_t kTcpMinHeaderLen = 20;
constexpr std::size_t kUdpHeaderLen = 8;
constexpr std::size_t kArpFixedHeaderLen = 8;

constexpr std::uint16_t kEtherTypeIpv4 = 0x0800;
constexpr std::uint16_t kEtherTypeArp = 0x0806;
constexpr std::uint16_t kEthernetLengthFieldMax = 1500;
constexpr std::uint16_t kIpv4MoreFragments = 0x2000;
constexpr std::uint16_t kIpv4FragmentOffsetMask = 0x1FFF;
constexpr std::uint8_t kIpProtocolTcp = 6;
constexpr std::uint8_t kIpProtocolUdp = 17;

bool to_u32(std::size_t value, std::uint32_t& out) noexcept {
    if (value > std::numeric_limits<std::uint32_t>::max()) {
        return false;
    }

    out = static_cast<std::uint32_t>(value);
    return true;
}

std::uint32_t bounded_payload_len(const PacketCursor& cursor, std::size_t offset, std::size_t header_len) noexcept {
    const auto payload_offset = offset + header_len;
    return static_cast<std::uint32_t>(std::min(
        cursor.available_from(payload_offset),
        static_cast<std::size_t>(std::numeric_limits<std::uint32_t>::max())));
}

bool add_layer(
    ParsedPacket& packet,
    ProtocolId protocol_id,
    std::size_t offset,
    std::size_t header_len,
    std::size_t payload_offset,
    std::size_t payload_len) {
    if (packet.layer_count >= kMaxParsedLayers) {
        packet.status = ParseStatus::Error;
        packet.error_message = "Parser layer limit exceeded.";
        return false;
    }

    ParsedLayer layer;
    layer.protocol_id = protocol_id;
    if (!to_u32(offset, layer.offset) || !to_u32(header_len, layer.header_len) ||
        !to_u32(payload_offset, layer.payload_offset) || !to_u32(payload_len, layer.payload_len)) {
        packet.status = ParseStatus::Error;
        packet.error_message = "Parser offset exceeded the public packet model range.";
        return false;
    }

    packet.layers[packet.layer_count] = layer;
    ++packet.layer_count;
    packet.top_protocol = protocol_id;
    return true;
}

void parse_arp(const PacketCursor& cursor, std::size_t offset, ParsedPacket& packet) {
    if (!cursor.can_read(offset, kArpFixedHeaderLen)) {
        packet.status = ParseStatus::Error;
        packet.error_message = "Truncated ARP header.";
        return;
    }

    const auto hardware_address_len = cursor.read_u8(offset + 4).value();
    const auto protocol_address_len = cursor.read_u8(offset + 5).value();
    const auto arp_header_len = kArpFixedHeaderLen + (2U * static_cast<std::size_t>(hardware_address_len)) +
                                (2U * static_cast<std::size_t>(protocol_address_len));
    if (!cursor.can_read(offset, arp_header_len)) {
        packet.status = ParseStatus::Error;
        packet.error_message = "Truncated ARP address fields.";
        return;
    }

    if (!add_layer(packet, ProtocolId::Arp, offset, arp_header_len, offset + arp_header_len, 0)) {
        return;
    }

    packet.status = ParseStatus::Parsed;
}

void parse_tcp(
    const PacketCursor& cursor,
    std::size_t offset,
    std::size_t ip_payload_len,
    std::size_t captured_ip_payload_len,
    ParsedPacket& packet) {
    if (ip_payload_len < kTcpMinHeaderLen || !cursor.can_read(offset, kTcpMinHeaderLen)) {
        packet.status = ParseStatus::Error;
        packet.error_message = "Truncated TCP header.";
        return;
    }

    const auto data_offset_byte = cursor.read_u8(offset + 12).value();
    const auto tcp_header_len = static_cast<std::size_t>((data_offset_byte >> 4U) * 4U);
    if (tcp_header_len < kTcpMinHeaderLen || tcp_header_len > ip_payload_len) {
        packet.status = ParseStatus::Error;
        packet.error_message = "Invalid TCP header length.";
        return;
    }

    if (!cursor.can_read(offset, tcp_header_len)) {
        packet.status = ParseStatus::Error;
        packet.error_message = "Truncated TCP options.";
        return;
    }

    const auto captured_tcp_payload_len = captured_ip_payload_len > tcp_header_len
                                             ? captured_ip_payload_len - tcp_header_len
                                             : 0;
    if (!add_layer(packet,
                   ProtocolId::Tcp,
                   offset,
                   tcp_header_len,
                   offset + tcp_header_len,
                   captured_tcp_payload_len)) {
        return;
    }

    packet.status = ParseStatus::Parsed;
}

void parse_udp(
    const PacketCursor& cursor,
    std::size_t offset,
    std::size_t ip_payload_len,
    std::size_t captured_ip_payload_len,
    ParsedPacket& packet) {
    if (ip_payload_len < kUdpHeaderLen || !cursor.can_read(offset, kUdpHeaderLen)) {
        packet.status = ParseStatus::Error;
        packet.error_message = "Truncated UDP header.";
        return;
    }

    const auto udp_len = cursor.read_be16(offset + 4).value();
    if (udp_len < kUdpHeaderLen || udp_len > ip_payload_len) {
        packet.status = ParseStatus::Error;
        packet.error_message = "Invalid UDP length.";
        return;
    }

    const auto declared_udp_payload_len = static_cast<std::size_t>(udp_len) - kUdpHeaderLen;
    const auto captured_udp_payload_len = captured_ip_payload_len > kUdpHeaderLen
                                             ? std::min(captured_ip_payload_len - kUdpHeaderLen, declared_udp_payload_len)
                                             : 0;
    if (!add_layer(packet,
                   ProtocolId::Udp,
                   offset,
                   kUdpHeaderLen,
                   offset + kUdpHeaderLen,
                   captured_udp_payload_len)) {
        return;
    }

    packet.status = ParseStatus::Parsed;
}

void parse_ipv4(const PacketCursor& cursor, std::size_t offset, ParsedPacket& packet) {
    if (!cursor.can_read(offset, kIpv4MinHeaderLen)) {
        packet.status = ParseStatus::Error;
        packet.error_message = "Truncated IPv4 header.";
        return;
    }

    const auto version_and_ihl = cursor.read_u8(offset).value();
    const auto version = static_cast<std::uint8_t>(version_and_ihl >> 4U);
    const auto header_len = static_cast<std::size_t>((version_and_ihl & 0x0FU) * 4U);
    if (version != 4) {
        packet.status = ParseStatus::Error;
        packet.error_message = "Invalid IPv4 version.";
        return;
    }
    if (header_len < kIpv4MinHeaderLen) {
        packet.status = ParseStatus::Error;
        packet.error_message = "Invalid IPv4 header length.";
        return;
    }
    if (!cursor.can_read(offset, header_len)) {
        packet.status = ParseStatus::Error;
        packet.error_message = "Truncated IPv4 options.";
        return;
    }

    const auto total_len = static_cast<std::size_t>(cursor.read_be16(offset + 2).value());
    if (total_len < header_len) {
        packet.status = ParseStatus::Error;
        packet.error_message = "Invalid IPv4 total length.";
        return;
    }

    const auto available_ip_len = std::min(total_len, cursor.available_from(offset));
    const auto ip_payload_len = total_len - header_len;
    const auto captured_ip_payload_len = available_ip_len >= header_len ? available_ip_len - header_len : 0;
    if (!add_layer(packet, ProtocolId::Ipv4, offset, header_len, offset + header_len, captured_ip_payload_len)) {
        return;
    }

    const auto fragment_info = cursor.read_be16(offset + 6).value();
    const auto fragment_offset = static_cast<std::uint16_t>(fragment_info & kIpv4FragmentOffsetMask);
    if (fragment_offset != 0) {
        packet.status = ParseStatus::Unsupported;
        return;
    }

    const auto protocol = cursor.read_u8(offset + 9).value();
    const auto payload_offset = offset + header_len;
    if (protocol == kIpProtocolTcp) {
        parse_tcp(cursor, payload_offset, ip_payload_len, captured_ip_payload_len, packet);
        return;
    }
    if (protocol == kIpProtocolUdp) {
        parse_udp(cursor, payload_offset, ip_payload_len, captured_ip_payload_len, packet);
        return;
    }

    if ((fragment_info & kIpv4MoreFragments) != 0) {
        packet.status = ParseStatus::Unsupported;
        return;
    }

    packet.status = ParseStatus::Unsupported;
}

ParsedPacket parse_ethernet(const PacketCursor& cursor) {
    ParsedPacket packet;
    if (!cursor.can_read(0, kEthernetHeaderLen)) {
        packet.status = ParseStatus::Error;
        packet.error_message = "Truncated Ethernet header.";
        return packet;
    }

    const auto ether_type = cursor.read_be16(12).value();
    if (!add_layer(packet,
                   ProtocolId::Ethernet,
                   0,
                   kEthernetHeaderLen,
                   kEthernetHeaderLen,
                   bounded_payload_len(cursor, 0, kEthernetHeaderLen))) {
        return packet;
    }

    if (ether_type <= kEthernetLengthFieldMax) {
        packet.status = ParseStatus::Unsupported;
        return packet;
    }

    switch (ether_type) {
    case kEtherTypeIpv4:
        parse_ipv4(cursor, kEthernetHeaderLen, packet);
        return packet;
    case kEtherTypeArp:
        parse_arp(cursor, kEthernetHeaderLen, packet);
        return packet;
    default:
        packet.status = ParseStatus::Unsupported;
        return packet;
    }
}

} // namespace

ParsedPacket PacketParser::parse(const RawPacketView& raw_packet) const {
    if (raw_packet.metadata.link_type != DLT_EN10MB) {
        ParsedPacket packet;
        packet.status = ParseStatus::Unsupported;
        return packet;
    }

    return parse_ethernet(PacketCursor(raw_packet.bytes));
}

} // namespace pruftnet::sniffing::internal

#include <cassert>
#include <cstddef>
#include <cstdint>
#include <initializer_list>
#include <span>
#include <vector>

#include <pcap/pcap.h>

#include "pruftnet/sniffing/packet.hpp"
#include "pruftnet/sniffing/parsed_packet.hpp"
#include "sniffing/packet_cursor.hpp"
#include "sniffing/packet_parser.hpp"

namespace {

using pruftnet::sniffing::ParseStatus;
using pruftnet::sniffing::ParsedPacket;
using pruftnet::sniffing::ProtocolId;
using pruftnet::sniffing::RawPacketView;
using pruftnet::sniffing::internal::PacketCursor;
using pruftnet::sniffing::internal::PacketParser;

void append(std::vector<std::byte>& bytes, std::initializer_list<unsigned int> values) {
    for (const auto value : values) {
        bytes.push_back(std::byte(static_cast<unsigned char>(value)));
    }
}

void append_ethernet_header(std::vector<std::byte>& bytes, std::uint16_t ether_type) {
    append(bytes, {
        0x00, 0x11, 0x22, 0x33, 0x44, 0x55,
        0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb,
        static_cast<unsigned int>((ether_type >> 8U) & 0xffU),
        static_cast<unsigned int>(ether_type & 0xffU),
    });
}

void append_ipv4_header(std::vector<std::byte>& bytes, std::uint16_t total_len, std::uint8_t protocol) {
    append(bytes, {
        0x45, 0x00,
        static_cast<unsigned int>((total_len >> 8U) & 0xffU),
        static_cast<unsigned int>(total_len & 0xffU),
        0x00, 0x00,
        0x00, 0x00,
        0x40,
        protocol,
        0x00, 0x00,
        192, 0, 2, 1,
        198, 51, 100, 2,
    });
}

std::vector<std::byte> ethernet_ipv4_udp_packet() {
    std::vector<std::byte> bytes;
    append_ethernet_header(bytes, 0x0800);
    append_ipv4_header(bytes, 28, 17);
    append(bytes, {
        0x30, 0x39,
        0x00, 0x35,
        0x00, 0x08,
        0x00, 0x00,
    });
    return bytes;
}

std::vector<std::byte> ethernet_ipv4_tcp_packet() {
    std::vector<std::byte> bytes;
    append_ethernet_header(bytes, 0x0800);
    append_ipv4_header(bytes, 40, 6);
    append(bytes, {
        0x30, 0x39,
        0x01, 0xbb,
        0x00, 0x00, 0x00, 0x01,
        0x00, 0x00, 0x00, 0x00,
        0x50, 0x02,
        0x20, 0x00,
        0x00, 0x00,
        0x00, 0x00,
    });
    return bytes;
}

std::vector<std::byte> ethernet_arp_packet() {
    std::vector<std::byte> bytes;
    append_ethernet_header(bytes, 0x0806);
    append(bytes, {
        0x00, 0x01,
        0x08, 0x00,
        0x06,
        0x04,
        0x00, 0x01,
        0x66, 0x77, 0x88, 0x99, 0xaa, 0xbb,
        192, 0, 2, 1,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        198, 51, 100, 2,
    });
    return bytes;
}

ParsedPacket parse_packet(const std::vector<std::byte>& bytes, int link_type = DLT_EN10MB) {
    RawPacketView raw;
    raw.metadata.link_type = static_cast<std::uint32_t>(link_type);
    raw.metadata.captured_len = static_cast<std::uint32_t>(bytes.size());
    raw.metadata.wire_len = static_cast<std::uint32_t>(bytes.size());
    raw.bytes = std::span<const std::byte>(bytes.data(), bytes.size());
    return PacketParser{}.parse(raw);
}

void packet_cursor_reads_big_endian_values_and_rejects_bounds() {
    const std::vector<std::byte> bytes = {
        std::byte{0x12},
        std::byte{0x34},
        std::byte{0x56},
        std::byte{0x78},
    };

    const PacketCursor cursor(std::span<const std::byte>(bytes.data(), bytes.size()));
    assert(cursor.size() == 4);
    assert(cursor.available_from(0) == 4);
    assert(cursor.available_from(3) == 1);
    assert(cursor.available_from(4) == 0);
    assert(cursor.can_read(0, 4));
    assert(cursor.can_read(4, 0));
    assert(!cursor.can_read(1, 4));
    assert(cursor.read_u8(0).value() == 0x12);
    assert(cursor.read_be16(1).value() == 0x3456);
    assert(cursor.read_be32(0).value() == 0x12345678U);
    assert(!cursor.read_u8(4).has_value());
    assert(!cursor.read_be16(3).has_value());
    assert(!cursor.read_be32(1).has_value());
}

void parser_extracts_ethernet_ipv4_udp_layers() {
    const auto parsed = parse_packet(ethernet_ipv4_udp_packet());
    assert(parsed.status == ParseStatus::Parsed);
    assert(parsed.top_protocol == ProtocolId::Udp);
    assert(parsed.layer_count == 3);
    assert(parsed.layers[0].protocol_id == ProtocolId::Ethernet);
    assert(parsed.layers[0].offset == 0);
    assert(parsed.layers[0].header_len == 14);
    assert(parsed.layers[1].protocol_id == ProtocolId::Ipv4);
    assert(parsed.layers[1].offset == 14);
    assert(parsed.layers[1].header_len == 20);
    assert(parsed.layers[2].protocol_id == ProtocolId::Udp);
    assert(parsed.layers[2].offset == 34);
    assert(parsed.layers[2].header_len == 8);
}

void parser_extracts_ethernet_ipv4_tcp_layers() {
    const auto parsed = parse_packet(ethernet_ipv4_tcp_packet());
    assert(parsed.status == ParseStatus::Parsed);
    assert(parsed.top_protocol == ProtocolId::Tcp);
    assert(parsed.layer_count == 3);
    assert(parsed.layers[0].protocol_id == ProtocolId::Ethernet);
    assert(parsed.layers[1].protocol_id == ProtocolId::Ipv4);
    assert(parsed.layers[2].protocol_id == ProtocolId::Tcp);
    assert(parsed.layers[2].offset == 34);
    assert(parsed.layers[2].header_len == 20);
}

void parser_extracts_ethernet_arp_layer() {
    const auto parsed = parse_packet(ethernet_arp_packet());
    assert(parsed.status == ParseStatus::Parsed);
    assert(parsed.top_protocol == ProtocolId::Arp);
    assert(parsed.layer_count == 2);
    assert(parsed.layers[0].protocol_id == ProtocolId::Ethernet);
    assert(parsed.layers[1].protocol_id == ProtocolId::Arp);
    assert(parsed.layers[1].offset == 14);
    assert(parsed.layers[1].header_len == 28);
}

void parser_marks_unknown_ethertype_as_unsupported() {
    std::vector<std::byte> bytes;
    append_ethernet_header(bytes, 0x88b5);
    append(bytes, {0x00, 0x01, 0x02, 0x03});

    const auto parsed = parse_packet(bytes);
    assert(parsed.status == ParseStatus::Unsupported);
    assert(parsed.top_protocol == ProtocolId::Ethernet);
    assert(parsed.layer_count == 1);
}

void parser_marks_unsupported_link_type_without_layers() {
    const auto parsed = parse_packet(ethernet_ipv4_udp_packet(), DLT_RAW);
    assert(parsed.status == ParseStatus::Unsupported);
    assert(parsed.top_protocol == ProtocolId::Unknown);
    assert(parsed.layer_count == 0);
}

void parser_reports_malformed_headers_as_errors() {
    std::vector<std::byte> short_ethernet = {std::byte{0x00}, std::byte{0x01}};
    auto parsed = parse_packet(short_ethernet);
    assert(parsed.status == ParseStatus::Error);
    assert(parsed.layer_count == 0);

    std::vector<std::byte> truncated_ipv4;
    append_ethernet_header(truncated_ipv4, 0x0800);
    append(truncated_ipv4, {0x46, 0x00, 0x00, 0x18, 0x00, 0x00, 0x00, 0x00, 0x40, 0x11});
    parsed = parse_packet(truncated_ipv4);
    assert(parsed.status == ParseStatus::Error);
    assert(parsed.layer_count == 1);
}

} // namespace

int main() {
    packet_cursor_reads_big_endian_values_and_rejects_bounds();
    parser_extracts_ethernet_ipv4_udp_layers();
    parser_extracts_ethernet_ipv4_tcp_layers();
    parser_extracts_ethernet_arp_layer();
    parser_marks_unknown_ethertype_as_unsupported();
    parser_marks_unsupported_link_type_without_layers();
    parser_reports_malformed_headers_as_errors();
    return 0;
}

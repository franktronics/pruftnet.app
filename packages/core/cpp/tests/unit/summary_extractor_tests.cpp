#include <array>
#include <cassert>
#include <cstddef>
#include <memory>
#include <span>
#include <variant>
#include <vector>

#include "parsing/packet_parser.hpp"
#include "pruftnet/parsing/summary_extractor.hpp"
#include "tests/support/ethernet_ipv4_udp_fixture.hpp"

namespace {
using namespace pruftnet;

parsing::RegistrySnapshotPtr registry() {
    auto value = parsing::make_core_registry();
    assert(std::holds_alternative<parsing::RegistrySnapshot>(value));
    return std::make_shared<const parsing::RegistrySnapshot>(
        std::move(std::get<parsing::RegistrySnapshot>(value)));
}

std::vector<std::byte> ethernet(std::uint16_t type, std::span<const std::byte> payload) {
    std::vector<std::byte> bytes(14 + payload.size(), std::byte{0});
    const std::array destination{std::byte{0x00}, std::byte{0x11}, std::byte{0x22},
                                 std::byte{0x33}, std::byte{0x44}, std::byte{0x55}};
    const std::array source{std::byte{0xaa}, std::byte{0xbb}, std::byte{0xcc},
                            std::byte{0xdd}, std::byte{0xee}, std::byte{0xff}};
    std::copy(destination.begin(), destination.end(), bytes.begin());
    std::copy(source.begin(), source.end(), bytes.begin() + 6);
    bytes[12] = static_cast<std::byte>(type >> 8U);
    bytes[13] = static_cast<std::byte>(type);
    std::copy(payload.begin(), payload.end(), bytes.begin() + 14);
    return bytes;
}

std::vector<std::byte> ipv6(std::uint8_t next_header, std::span<const std::byte> payload) {
    std::vector<std::byte> packet(40 + payload.size(), std::byte{0});
    packet[0] = std::byte{0x60};
    packet[4] = static_cast<std::byte>(payload.size() >> 8U);
    packet[5] = static_cast<std::byte>(payload.size());
    packet[6] = static_cast<std::byte>(next_header);
    packet[7] = std::byte{64};
    const std::array source{std::byte{0x20}, std::byte{0x01}, std::byte{0x0d}, std::byte{0xb8},
                            std::byte{0}, std::byte{0}, std::byte{0}, std::byte{0},
                            std::byte{0}, std::byte{0}, std::byte{0}, std::byte{0},
                            std::byte{0}, std::byte{0}, std::byte{0}, std::byte{1}};
    const std::array destination{std::byte{0x20}, std::byte{0x01}, std::byte{0x0d}, std::byte{0xb8},
                                 std::byte{0}, std::byte{0}, std::byte{0}, std::byte{1},
                                 std::byte{0}, std::byte{0}, std::byte{0}, std::byte{0},
                                 std::byte{0}, std::byte{0}, std::byte{0}, std::byte{2}};
    std::copy(source.begin(), source.end(), packet.begin() + 8);
    std::copy(destination.begin(), destination.end(), packet.begin() + 24);
    std::copy(payload.begin(), payload.end(), packet.begin() + 40);
    return ethernet(0x86dd, packet);
}

parsing::PacketSummaryFields summarize(const parsing::RegistrySnapshotPtr& snapshot,
                                       std::span<const std::byte> bytes,
                                       std::size_t wire_length = 0,
                                       std::uint32_t flags = 0) {
    parsing::internal::PacketParser parser(snapshot);
    const auto raw = tests::raw_packet_view(bytes, wire_length == 0 ? bytes.size() : wire_length, 1, flags);
    const auto tree = parser.parse(raw);
    return parsing::SummaryExtractor(*snapshot).extract(raw, tree);
}

void ethernet_and_vlan_fallbacks() {
    const auto snapshot = registry();
    const std::array payload{std::byte{1}, std::byte{2}};
    const auto plain = summarize(snapshot, ethernet(0x88b5, payload));
    assert(plain.source == "aa:bb:cc:dd:ee:ff");
    assert(plain.destination == "00:11:22:33:44:55");
    assert(plain.protocol == "Ethernet");

    const std::array vlan{std::byte{0}, std::byte{7}, std::byte{0x88}, std::byte{0xb5}, std::byte{1}};
    const auto tagged = summarize(snapshot, ethernet(0x8100, vlan));
    assert(tagged.protocol == "VLAN");
    assert(tagged.source == plain.source && tagged.destination == plain.destination);
}

void arp_protocol_addresses_are_typed() {
    const auto snapshot = registry();
    std::vector<std::byte> arp(26, std::byte{0});
    arp[1] = std::byte{1};
    arp[2] = std::byte{0x86}; arp[3] = std::byte{0xdd};
    arp[4] = std::byte{6}; arp[5] = std::byte{3}; arp[7] = std::byte{1};
    arp[14] = std::byte{1}; arp[15] = std::byte{2}; arp[16] = std::byte{3};
    arp[23] = std::byte{0xaa}; arp[24] = std::byte{0xbb}; arp[25] = std::byte{0xcc};
    const auto summary = summarize(snapshot, ethernet(0x0806, arp));
    assert(summary.source == "0x010203");
    assert(summary.destination == "0xaabbcc");
    assert(summary.info == "Who has 0xaabbcc? Tell 0x010203");
}

void ipv6_and_icmp_labels() {
    const auto snapshot = registry();
    const std::array echo{std::byte{128}, std::byte{0}, std::byte{0}, std::byte{0},
                          std::byte{0}, std::byte{1}, std::byte{0}, std::byte{2}};
    const auto summary = summarize(snapshot, ipv6(58, echo));
    assert(summary.source == "2001:db8::1");
    assert(summary.destination == "2001:db8:0:1::2");
    assert(summary.info == "Echo request, Code 0, id=1, seq=2");

    std::array<std::byte, 8> solicitation{};
    solicitation[0] = std::byte{133};
    const auto nd = summarize(snapshot, ipv6(58, solicitation));
    assert(nd.info == "Router solicitation, Code 0");
}

void incomplete_headers_do_not_invent_values_or_hide_link_addresses() {
    const auto snapshot = registry();
    auto udp = tests::ethernet_ipv4_udp_packet();
    udp.resize(35);
    const auto truncated = summarize(snapshot, udp, 42, sniffing::PacketFlagTruncated);
    assert(truncated.protocol == "UDP");
    assert(truncated.info == "Truncated UDP header");
    assert(truncated.info.find('0') == std::string::npos);
    assert(truncated.source == "192.0.2.10");
    assert(truncated.destination == "198.51.100.20");

    auto partial_ip = tests::ethernet_ipv4_udp_packet();
    partial_ip.resize(31);
    const auto link_fallback = summarize(snapshot, partial_ip, 42, sniffing::PacketFlagTruncated);
    assert(link_fallback.source == "66:77:88:99:aa:bb");
    assert(link_fallback.destination == "00:11:22:33:44:55");

    auto malformed = tests::ethernet_ipv4_udp_packet();
    malformed[38] = std::byte{0}; malformed[39] = std::byte{7};
    const auto invalid = summarize(snapshot, malformed);
    assert(invalid.protocol == "UDP");
    assert(invalid.info.find("40001 -> 5001") == 0);

    const auto short_icmp = summarize(snapshot, ipv6(58, std::array{std::byte{128}}), 55,
                                      sniffing::PacketFlagTruncated);
    assert(short_icmp.protocol == "ICMPv6");
    assert(short_icmp.info == "Truncated ICMPv6 header");
}
} // namespace

int main() {
    ethernet_and_vlan_fallbacks();
    arp_protocol_addresses_are_typed();
    ipv6_and_icmp_labels();
    incomplete_headers_do_not_invent_values_or_hide_link_addresses();
    return 0;
}

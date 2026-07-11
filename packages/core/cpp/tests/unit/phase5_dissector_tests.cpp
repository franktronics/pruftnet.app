#include <algorithm>
#include <array>
#include <cassert>
#include <cstddef>
#include <functional>
#include <memory>
#include <span>
#include <string_view>
#include <utility>
#include <variant>
#include <vector>

#include "parsing/packet_parser.hpp"
#include "pruftnet/parsing/registry.hpp"
#include "tests/support/ethernet_ipv4_udp_fixture.hpp"

namespace {

using namespace pruftnet::parsing;
using pruftnet::parsing::internal::PacketParser;

RegistrySnapshotPtr core_registry() {
    auto result = make_core_registry();
    assert(std::holds_alternative<RegistrySnapshot>(result));
    return std::make_shared<const RegistrySnapshot>(std::move(std::get<RegistrySnapshot>(result)));
}

FieldId field_id(const RegistrySnapshot& registry, std::string_view key) {
    const auto result = registry.field(key);
    assert(std::holds_alternative<std::reference_wrapper<const FieldDescriptor>>(result));
    return std::get<std::reference_wrapper<const FieldDescriptor>>(result).get().id;
}

const ParsedFieldNode& node(const ParsedPacketTree& tree, const RegistrySnapshot& registry, std::string_view key) {
    const auto id = field_id(registry, key);
    const auto found = std::find_if(tree.nodes().begin(), tree.nodes().end(),
                                    [id](const auto& candidate) { return candidate.field_id == id; });
    assert(found != tree.nodes().end());
    return *found;
}

std::size_t node_count(const ParsedPacketTree& tree, const RegistrySnapshot& registry, std::string_view key) {
    const auto id = field_id(registry, key);
    return static_cast<std::size_t>(std::count_if(tree.nodes().begin(), tree.nodes().end(),
                                                  [id](const auto& candidate) { return candidate.field_id == id; }));
}

std::vector<std::byte> ethernet_packet(std::uint16_t type, std::span<const std::byte> payload) {
    std::vector<std::byte> bytes(14 + payload.size(), std::byte{0});
    bytes[12] = static_cast<std::byte>(type >> 8U);
    bytes[13] = static_cast<std::byte>(type & 0xffU);
    std::copy(payload.begin(), payload.end(), bytes.begin() + 14);
    return bytes;
}

std::vector<std::byte> ipv4_packet(std::uint8_t protocol, std::span<const std::byte> payload) {
    std::vector<std::byte> ip(20 + payload.size(), std::byte{0});
    ip[0] = std::byte{0x45};
    const auto length = static_cast<std::uint16_t>(ip.size());
    ip[2] = static_cast<std::byte>(length >> 8U);
    ip[3] = static_cast<std::byte>(length & 0xffU);
    ip[8] = std::byte{64};
    ip[9] = static_cast<std::byte>(protocol);
    std::copy(payload.begin(), payload.end(), ip.begin() + 20);
    return ethernet_packet(0x0800, ip);
}

std::vector<std::byte> ipv6_packet(std::uint8_t next_header, std::span<const std::byte> payload) {
    std::vector<std::byte> ip(40 + payload.size(), std::byte{0});
    ip[0] = std::byte{0x60};
    const auto length = static_cast<std::uint16_t>(payload.size());
    ip[4] = static_cast<std::byte>(length >> 8U);
    ip[5] = static_cast<std::byte>(length & 0xffU);
    ip[6] = static_cast<std::byte>(next_header);
    ip[7] = std::byte{64};
    ip[8] = std::byte{0x20};
    ip[9] = std::byte{0x01};
    ip[24] = std::byte{0x20};
    ip[25] = std::byte{0x01};
    std::copy(payload.begin(), payload.end(), ip.begin() + 40);
    return ethernet_packet(0x86dd, ip);
}

void arp_parses_variable_addresses_and_excludes_padding() {
    std::vector<std::byte> arp(28, std::byte{0});
    arp[1] = std::byte{1};
    arp[2] = std::byte{0x08};
    arp[4] = std::byte{6};
    arp[5] = std::byte{4};
    arp[7] = std::byte{1};
    arp[8] = std::byte{0xaa};
    arp[14] = std::byte{192};
    arp[17] = std::byte{10};
    arp[24] = std::byte{192};
    arp[27] = std::byte{20};
    auto bytes = ethernet_packet(0x0806, arp);
    bytes.insert(bytes.end(), 18, std::byte{0});
    const auto registry = core_registry();
    PacketParser parser(registry);
    const auto tree = parser.parse(pruftnet::tests::raw_packet_view(bytes, bytes.size()));
    assert(tree.condition() == ParseCondition::Complete);
    assert(node(tree, *registry, "arp.operation").value_low == 1);
    assert(node(tree, *registry, "arp.packet").length == 28);
    assert(node(tree, *registry, "arp.sender_hardware").length == 6);
    assert(node(tree, *registry, "arp.sender_protocol").length == 4);
    assert(node(tree, *registry, "unknown.data").length == 18);

    auto malformed = bytes;
    malformed[18] = std::byte{100};
    assert(parser.parse(pruftnet::tests::raw_packet_view(malformed, malformed.size())).condition() ==
           ParseCondition::Malformed);
}

void icmpv4_echo_and_errors_are_bounded() {
    const std::array echo{std::byte{8}, std::byte{0}, std::byte{0x12}, std::byte{0x34}, std::byte{0xab},
                          std::byte{0xcd}, std::byte{0}, std::byte{7}, std::byte{'x'}};
    const auto bytes = ipv4_packet(1, echo);
    const auto registry = core_registry();
    PacketParser parser(registry);
    const auto tree = parser.parse(pruftnet::tests::raw_packet_view(bytes, bytes.size()));
    assert(tree.condition() == ParseCondition::Complete);
    assert(node(tree, *registry, "icmp.type").value_low == 8);
    assert(node(tree, *registry, "icmp.identifier").value_low == 0xabcd);
    assert(node(tree, *registry, "icmp.sequence").value_low == 7);
    assert(node_count(tree, *registry, "icmp.body") == 2);

    const std::array unreachable{std::byte{3}, std::byte{4}, std::byte{0}, std::byte{0}, std::byte{0},
                                 std::byte{0}, std::byte{0x05}, std::byte{0xdc}, std::byte{0x45}};
    const auto error_bytes = ipv4_packet(1, unreachable);
    const auto error_tree = parser.parse(pruftnet::tests::raw_packet_view(error_bytes, error_bytes.size()));
    assert(node(error_tree, *registry, "icmp.mtu").value_low == 1500);
    assert(node(error_tree, *registry, "icmp.quoted").length == 1);
}

void ipv6_dispatches_direct_and_bounded_extensions() {
    const std::array udp{std::byte{0x12}, std::byte{0x34}, std::byte{0x00}, std::byte{0x35},
                         std::byte{0x00}, std::byte{0x08}, std::byte{0}, std::byte{0}};
    const auto direct = ipv6_packet(17, udp);
    const auto registry = core_registry();
    PacketParser parser(registry);
    const auto direct_tree = parser.parse(pruftnet::tests::raw_packet_view(direct, direct.size()));
    assert(direct_tree.condition() == ParseCondition::Complete);
    assert(node(direct_tree, *registry, "ipv6.version").value_low == 6);
    assert(node_count(direct_tree, *registry, "udp.datagram") == 1);

    const std::array with_extension{
        std::byte{58}, std::byte{0}, std::byte{0}, std::byte{0}, std::byte{0}, std::byte{0}, std::byte{0}, std::byte{0},
        std::byte{128}, std::byte{0}, std::byte{0}, std::byte{0}, std::byte{0x12}, std::byte{0x34}, std::byte{0},
        std::byte{1}};
    const auto extended = ipv6_packet(0, with_extension);
    const auto extended_tree = parser.parse(pruftnet::tests::raw_packet_view(extended, extended.size()));
    assert(extended_tree.condition() == ParseCondition::Complete);
    assert(node_count(extended_tree, *registry, "ipv6.extension") == 1);
    assert(node(extended_tree, *registry, "icmpv6.type").value_low == 128);

    for (std::size_t captured = 0; captured < extended.size(); ++captured) {
        const auto span = std::span<const std::byte>(extended.data(), captured);
        assert(parser.parse(pruftnet::tests::raw_packet_view(span, extended.size(), 1,
                                                             pruftnet::sniffing::PacketFlagTruncated))
                   .condition() == ParseCondition::Partial);
    }
}

void ipv6_fragments_do_not_claim_upper_layers() {
    const std::array fragment{
        std::byte{17}, std::byte{0}, std::byte{0}, std::byte{1}, std::byte{0x12}, std::byte{0x34}, std::byte{0x56},
        std::byte{0x78}, std::byte{0}, std::byte{0}, std::byte{0}, std::byte{0}, std::byte{0}, std::byte{0},
        std::byte{0}, std::byte{0}};
    const auto bytes = ipv6_packet(44, fragment);
    const auto registry = core_registry();
    PacketParser parser(registry);
    const auto tree = parser.parse(pruftnet::tests::raw_packet_view(bytes, bytes.size()));
    assert(tree.condition() == ParseCondition::Complete);
    assert(node(tree, *registry, "ipv6.fragment_more").value_low == 1);
    assert(node_count(tree, *registry, "udp.datagram") == 0);
    assert(node(tree, *registry, "unknown.data").length == 8);
}

void neighbor_discovery_options_are_structured_and_progress_bounded() {
    std::array<std::byte, 24> advertisement{};
    advertisement[0] = std::byte{134};
    advertisement[4] = std::byte{64};
    advertisement[6] = std::byte{0x07};
    advertisement[7] = std::byte{0x08};
    advertisement[16] = std::byte{5};
    advertisement[17] = std::byte{1};
    advertisement[22] = std::byte{0x05};
    advertisement[23] = std::byte{0xdc};
    const auto bytes = ipv6_packet(58, advertisement);
    const auto registry = core_registry();
    PacketParser parser(registry);
    const auto tree = parser.parse(pruftnet::tests::raw_packet_view(bytes, bytes.size()));
    assert(tree.condition() == ParseCondition::Complete);
    assert(node(tree, *registry, "icmpv6.router_lifetime").value_low == 1800);
    assert(node(tree, *registry, "icmpv6.option_type").value_low == 5);
    assert(node(tree, *registry, "icmpv6.mtu").value_low == 1500);

    auto zero_length = advertisement;
    zero_length[17] = std::byte{0};
    const auto malformed = ipv6_packet(58, zero_length);
    assert(parser.parse(pruftnet::tests::raw_packet_view(malformed, malformed.size())).condition() ==
           ParseCondition::Malformed);
}

void ip_family_dispatch_isolated_and_extension_lengths_are_validated() {
    const std::array icmp_header{std::byte{128}, std::byte{0}, std::byte{0}, std::byte{0},
                                 std::byte{0}, std::byte{1}, std::byte{0}, std::byte{2}};
    const auto registry = core_registry();
    PacketParser parser(registry);
    const auto wrong_v4 = ipv4_packet(58, icmp_header);
    const auto wrong_v4_tree = parser.parse(pruftnet::tests::raw_packet_view(wrong_v4, wrong_v4.size()));
    assert(node_count(wrong_v4_tree, *registry, "icmpv6.message") == 0);
    assert(node(wrong_v4_tree, *registry, "unknown.data").length == icmp_header.size());

    const auto wrong_v6 = ipv6_packet(1, icmp_header);
    const auto wrong_v6_tree = parser.parse(pruftnet::tests::raw_packet_view(wrong_v6, wrong_v6.size()));
    assert(node_count(wrong_v6_tree, *registry, "icmp.message") == 0);
    assert(node(wrong_v6_tree, *registry, "unknown.data").length == icmp_header.size());

    const std::array short_ah{std::byte{59}, std::byte{0}, std::byte{0}, std::byte{0},
                              std::byte{0}, std::byte{0}, std::byte{0}, std::byte{0}};
    const auto invalid_ah = ipv6_packet(51, short_ah);
    assert(parser.parse(pruftnet::tests::raw_packet_view(invalid_ah, invalid_ah.size())).condition() ==
           ParseCondition::Malformed);

    const std::array valid_ah{std::byte{59}, std::byte{1}, std::byte{0}, std::byte{0}, std::byte{0}, std::byte{0},
                              std::byte{0}, std::byte{0}, std::byte{0}, std::byte{0}, std::byte{0}, std::byte{0}};
    const auto ah = ipv6_packet(51, valid_ah);
    assert(parser.parse(pruftnet::tests::raw_packet_view(ah, ah.size())).condition() == ParseCondition::Complete);
}

void unknown_icmp_codes_and_redirect_addresses_preserve_bytes() {
    const std::array unknown_code{std::byte{3}, std::byte{99}, std::byte{0}, std::byte{0}, std::byte{1},
                                  std::byte{2}, std::byte{3}, std::byte{4}, std::byte{5}};
    const auto registry = core_registry();
    PacketParser parser(registry);
    const auto unknown_bytes = ipv4_packet(1, unknown_code);
    const auto unknown_tree = parser.parse(pruftnet::tests::raw_packet_view(unknown_bytes, unknown_bytes.size()));
    assert(node(unknown_tree, *registry, "icmp.body").length == 5);
    assert(node_count(unknown_tree, *registry, "icmp.quoted") == 0);

    std::array<std::byte, 40> redirect{};
    redirect[0] = std::byte{137};
    redirect[8] = std::byte{0x20};
    redirect[9] = std::byte{0x01};
    redirect[24] = std::byte{0x20};
    redirect[25] = std::byte{0x02};
    const auto redirect_bytes = ipv6_packet(58, redirect);
    const auto redirect_tree = parser.parse(pruftnet::tests::raw_packet_view(redirect_bytes, redirect_bytes.size()));
    assert(node(redirect_tree, *registry, "icmpv6.target").length == 16);
    assert(node(redirect_tree, *registry, "icmpv6.destination").length == 16);
}

void fragment_offsets_and_dispatch_budgets_are_explicit() {
    const std::array fragment{
        std::byte{17}, std::byte{0}, std::byte{0}, std::byte{8}, std::byte{0}, std::byte{0}, std::byte{0},
        std::byte{1}, std::byte{0}, std::byte{0}, std::byte{0}, std::byte{0}, std::byte{0}, std::byte{0},
        std::byte{0}, std::byte{0}};
    const auto bytes = ipv6_packet(44, fragment);
    const auto registry = core_registry();
    PacketParser parser(registry);
    const auto tree = parser.parse(pruftnet::tests::raw_packet_view(bytes, bytes.size()));
    assert(node(tree, *registry, "ipv6.fragment_offset_encoded").value_low == 1);
    assert(node(tree, *registry, "ipv6.fragment_offset").value_low == 8);

    ParseBudget budget;
    budget.max_dissector_calls = 2;
    PacketParser limited(registry, budget);
    const auto limited_tree = limited.parse(pruftnet::tests::raw_packet_view(bytes, bytes.size()));
    assert(limited_tree.condition() == ParseCondition::ResourceLimit);
}

void selected_icmp_message_families_remain_parseable() {
    const auto registry = core_registry();
    PacketParser parser(registry);
    for (const std::uint8_t type : {std::uint8_t{0}, std::uint8_t{3}, std::uint8_t{5}, std::uint8_t{8},
                                    std::uint8_t{11}, std::uint8_t{12}}) {
        std::array<std::byte, 8> message{};
        message[0] = static_cast<std::byte>(type);
        const auto bytes = ipv4_packet(1, message);
        assert(parser.parse(pruftnet::tests::raw_packet_view(bytes, bytes.size())).condition() ==
               ParseCondition::Complete);
    }
    for (const std::uint8_t type : {std::uint8_t{1}, std::uint8_t{2}, std::uint8_t{3}, std::uint8_t{4},
                                    std::uint8_t{128}, std::uint8_t{129}, std::uint8_t{133}}) {
        std::array<std::byte, 8> message{};
        message[0] = static_cast<std::byte>(type);
        const auto bytes = ipv6_packet(58, message);
        assert(parser.parse(pruftnet::tests::raw_packet_view(bytes, bytes.size())).condition() ==
               ParseCondition::Complete);
    }
    for (const auto [type, length] : {std::pair{std::uint8_t{134}, std::size_t{16}},
                                     std::pair{std::uint8_t{135}, std::size_t{24}},
                                     std::pair{std::uint8_t{136}, std::size_t{24}},
                                     std::pair{std::uint8_t{137}, std::size_t{40}}}) {
        std::vector<std::byte> message(length, std::byte{0});
        message[0] = static_cast<std::byte>(type);
        const auto bytes = ipv6_packet(58, message);
        assert(parser.parse(pruftnet::tests::raw_packet_view(bytes, bytes.size())).condition() ==
               ParseCondition::Complete);
    }
}

void arp_and_ipv6_declared_boundaries_are_exhaustive() {
    std::array<std::byte, 28> arp{};
    arp[1] = std::byte{1};
    arp[2] = std::byte{0x08};
    arp[4] = std::byte{6};
    arp[5] = std::byte{4};
    arp[7] = std::byte{2};
    const auto arp_bytes = ethernet_packet(0x0806, arp);
    const auto registry = core_registry();
    PacketParser parser(registry);
    for (std::size_t captured = 0; captured < arp_bytes.size(); ++captured) {
        const auto span = std::span<const std::byte>(arp_bytes.data(), captured);
        assert(parser.parse(pruftnet::tests::raw_packet_view(span, arp_bytes.size(), 1,
                                                             pruftnet::sniffing::PacketFlagTruncated))
                   .condition() == ParseCondition::Partial);
    }

    const std::array udp{std::byte{0}, std::byte{1}, std::byte{0}, std::byte{2},
                         std::byte{0}, std::byte{8}, std::byte{0}, std::byte{0}};
    auto oversized = ipv6_packet(17, udp);
    oversized[18] = std::byte{0};
    oversized[19] = std::byte{40};
    assert(parser.parse(pruftnet::tests::raw_packet_view(oversized, oversized.size())).condition() ==
           ParseCondition::Malformed);

    const std::array invalid_order{
        std::byte{0}, std::byte{0}, std::byte{0}, std::byte{0}, std::byte{0}, std::byte{0}, std::byte{0}, std::byte{0},
        std::byte{59}, std::byte{0}, std::byte{0}, std::byte{0}, std::byte{0}, std::byte{0}, std::byte{0},
        std::byte{0}};
    const auto ordered = ipv6_packet(60, invalid_order);
    assert(parser.parse(pruftnet::tests::raw_packet_view(ordered, ordered.size())).condition() ==
           ParseCondition::Malformed);
}

void icmp_and_nd_truncation_preserve_fixed_prefixes() {
    const auto registry = core_registry();
    PacketParser parser(registry);
    const std::array echo{std::byte{8}, std::byte{0}, std::byte{0}, std::byte{0}, std::byte{0x12},
                          std::byte{0x34}, std::byte{0}, std::byte{1}, std::byte{'x'}};
    const auto echo_bytes = ipv4_packet(1, echo);
    for (std::size_t captured = 0; captured < echo_bytes.size(); ++captured) {
        const auto span = std::span<const std::byte>(echo_bytes.data(), captured);
        assert(parser.parse(pruftnet::tests::raw_packet_view(span, echo_bytes.size(), 1,
                                                             pruftnet::sniffing::PacketFlagTruncated))
                   .condition() == ParseCondition::Partial);
    }
    const auto fixed_prefix_tree = parser.parse(pruftnet::tests::raw_packet_view(
        std::span<const std::byte>(echo_bytes.data(), 40), echo_bytes.size(), 1,
        pruftnet::sniffing::PacketFlagTruncated));
    assert(node(fixed_prefix_tree, *registry, "icmp.body").length == 2);

    std::array<std::byte, 24> advertisement{};
    advertisement[0] = std::byte{134};
    advertisement[16] = std::byte{5};
    advertisement[17] = std::byte{1};
    const auto advertisement_bytes = ipv6_packet(58, advertisement);
    for (std::size_t captured = 0; captured < advertisement_bytes.size(); ++captured) {
        const auto span = std::span<const std::byte>(advertisement_bytes.data(), captured);
        assert(parser.parse(pruftnet::tests::raw_packet_view(span, advertisement_bytes.size(), 1,
                                                             pruftnet::sniffing::PacketFlagTruncated))
                   .condition() == ParseCondition::Partial);
    }

    std::array<std::byte, 56> redirect{};
    redirect[0] = std::byte{137};
    redirect[40] = std::byte{4};
    redirect[41] = std::byte{2};
    redirect[48] = std::byte{0x60};
    const auto redirect_bytes = ipv6_packet(58, redirect);
    const auto redirect_tree = parser.parse(pruftnet::tests::raw_packet_view(redirect_bytes, redirect_bytes.size()));
    assert(node(redirect_tree, *registry, "icmpv6.redirected_packet").length == 8);
}

void extension_fragment_and_nd_option_matrix_is_bounded() {
    const auto registry = core_registry();
    PacketParser parser(registry);
    const std::array two_extensions{
        std::byte{60}, std::byte{0}, std::byte{0}, std::byte{0}, std::byte{0}, std::byte{0}, std::byte{0}, std::byte{0},
        std::byte{17}, std::byte{0}, std::byte{0}, std::byte{0}, std::byte{0}, std::byte{0}, std::byte{0},
        std::byte{0}, std::byte{0}, std::byte{1}, std::byte{0}, std::byte{2}, std::byte{0}, std::byte{8},
        std::byte{0}, std::byte{0}};
    const auto chained = ipv6_packet(0, two_extensions);
    const auto chained_tree = parser.parse(pruftnet::tests::raw_packet_view(chained, chained.size()));
    assert(chained_tree.condition() == ParseCondition::Complete);
    assert(node_count(chained_tree, *registry, "ipv6.extension") == 2);
    assert(node_count(chained_tree, *registry, "udp.datagram") == 1);

    const std::array atomic_fragment{
        std::byte{17}, std::byte{0}, std::byte{0}, std::byte{0}, std::byte{0}, std::byte{0}, std::byte{0},
        std::byte{1}, std::byte{0}, std::byte{1}, std::byte{0}, std::byte{2}, std::byte{0}, std::byte{8},
        std::byte{0}, std::byte{0}};
    const auto atomic = ipv6_packet(44, atomic_fragment);
    assert(node_count(parser.parse(pruftnet::tests::raw_packet_view(atomic, atomic.size())), *registry,
                      "udp.datagram") == 1);

    const std::array misaligned_fragment{
        std::byte{17}, std::byte{0}, std::byte{0}, std::byte{1}, std::byte{0}, std::byte{0}, std::byte{0},
        std::byte{1}, std::byte{0}, std::byte{0}, std::byte{0}, std::byte{0}, std::byte{0}, std::byte{0},
        std::byte{0}};
    const auto misaligned = ipv6_packet(44, misaligned_fragment);
    assert(parser.parse(pruftnet::tests::raw_packet_view(misaligned, misaligned.size())).condition() ==
           ParseCondition::Malformed);
    const std::array<std::byte, 0> empty{};
    const auto unsupported_jumbo = ipv6_packet(0, empty);
    assert(parser.parse(pruftnet::tests::raw_packet_view(unsupported_jumbo, unsupported_jumbo.size())).condition() ==
           ParseCondition::Malformed);

    std::vector<std::byte> options(16 + 8 + 32 + 8 + 8 + 8, std::byte{0});
    options[0] = std::byte{134};
    options[16] = std::byte{1};
    options[17] = std::byte{1};
    options[24] = std::byte{3};
    options[25] = std::byte{4};
    options[26] = std::byte{64};
    options[56] = std::byte{99};
    options[57] = std::byte{1};
    options[64] = std::byte{5};
    options[65] = std::byte{1};
    options[72] = std::byte{5};
    options[73] = std::byte{1};
    const auto option_bytes = ipv6_packet(58, options);
    const auto option_tree = parser.parse(pruftnet::tests::raw_packet_view(option_bytes, option_bytes.size()));
    assert(option_tree.condition() == ParseCondition::Complete);
    assert(node_count(option_tree, *registry, "icmpv6.option") == 5);
    assert(node_count(option_tree, *registry, "icmpv6.link_layer_address") == 1);
    assert(node_count(option_tree, *registry, "icmpv6.prefix") == 1);
    assert(node_count(option_tree, *registry, "icmpv6.option_body") == 1);

    auto overrun = options;
    overrun[73] = std::byte{2};
    const auto overrun_bytes = ipv6_packet(58, overrun);
    assert(parser.parse(pruftnet::tests::raw_packet_view(overrun_bytes, overrun_bytes.size())).condition() ==
           ParseCondition::Malformed);

    std::array<std::byte, 8> unknown_code{};
    unknown_code[0] = std::byte{2};
    unknown_code[1] = std::byte{9};
    const auto unknown_code_bytes = ipv6_packet(58, unknown_code);
    const auto unknown_code_tree =
        parser.parse(pruftnet::tests::raw_packet_view(unknown_code_bytes, unknown_code_bytes.size()));
    assert(node_count(unknown_code_tree, *registry, "icmpv6.mtu") == 0);
    assert(node(unknown_code_tree, *registry, "icmpv6.body").length == 4);

    ParseBudget limited_budget;
    limited_budget.max_dissector_calls = 4;
    PacketParser limited(registry, limited_budget);
    const auto limited_tree = limited.parse(pruftnet::tests::raw_packet_view(chained, chained.size()));
    assert(limited_tree.condition() == ParseCondition::ResourceLimit);
    assert(node_count(limited_tree, *registry, "unknown.data") == 0);
}

} // namespace

int main() {
    arp_parses_variable_addresses_and_excludes_padding();
    icmpv4_echo_and_errors_are_bounded();
    ipv6_dispatches_direct_and_bounded_extensions();
    ipv6_fragments_do_not_claim_upper_layers();
    neighbor_discovery_options_are_structured_and_progress_bounded();
    ip_family_dispatch_isolated_and_extension_lengths_are_validated();
    unknown_icmp_codes_and_redirect_addresses_preserve_bytes();
    fragment_offsets_and_dispatch_budgets_are_explicit();
    selected_icmp_message_families_remain_parseable();
    arp_and_ipv6_declared_boundaries_are_exhaustive();
    icmp_and_nd_truncation_preserve_fixed_prefixes();
    extension_fragment_and_nd_option_matrix_is_bounded();
}

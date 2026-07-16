#include <algorithm>
#include <array>
#include <cassert>
#include <cstddef>
#include <cstdint>
#include <memory>
#include <span>
#include <utility>
#include <variant>
#include <vector>

#include "parsing/packet_parser.hpp"
#include "pruftnet/parsing/registry.hpp"
#include "tests/support/ethernet_ipv4_udp_fixture.hpp"
#include "tests/support/parsed_tree_test_support.hpp"

namespace {

using namespace pruftnet::parsing;
using pruftnet::parsing::internal::PacketParser;
using pruftnet::tests::node;
using pruftnet::tests::node_count;
namespace sniffing = pruftnet::sniffing;

RegistrySnapshotPtr core_registry() {
  auto result = make_core_registry();
  assert(std::holds_alternative<RegistrySnapshot>(result));
  return std::make_shared<const RegistrySnapshot>(
      std::move(std::get<RegistrySnapshot>(result)));
}

std::vector<std::byte> ethernet_packet(std::uint16_t type,
                                       std::span<const std::byte> payload) {
  std::vector<std::byte> bytes(14 + payload.size(), std::byte{0});
  bytes[12] = static_cast<std::byte>(type >> 8U);
  bytes[13] = static_cast<std::byte>(type & 0xffU);
  std::copy(payload.begin(), payload.end(), bytes.begin() + 14);
  return bytes;
}

std::vector<std::byte> ipv4_fragment(std::uint16_t flags_offset,
                                     std::span<const std::byte> payload) {
  std::vector<std::byte> ip(20 + payload.size(), std::byte{0});
  ip[0] = std::byte{0x45};
  const auto length = static_cast<std::uint16_t>(ip.size());
  ip[2] = static_cast<std::byte>(length >> 8U);
  ip[3] = static_cast<std::byte>(length & 0xffU);
  ip[4] = std::byte{0x12};
  ip[5] = std::byte{0x34};
  ip[6] = static_cast<std::byte>(flags_offset >> 8U);
  ip[7] = static_cast<std::byte>(flags_offset & 0xffU);
  ip[8] = std::byte{64};
  ip[9] = std::byte{17};
  std::copy(payload.begin(), payload.end(), ip.begin() + 20);
  return ethernet_packet(0x0800, ip);
}

std::vector<std::byte> ipv6_packet(std::uint8_t next_header,
                                   std::span<const std::byte> payload) {
  std::vector<std::byte> ip(40 + payload.size(), std::byte{0});
  ip[0] = std::byte{0x60};
  const auto length = static_cast<std::uint16_t>(payload.size());
  ip[4] = static_cast<std::byte>(length >> 8U);
  ip[5] = static_cast<std::byte>(length & 0xffU);
  ip[6] = static_cast<std::byte>(next_header);
  ip[7] = std::byte{64};
  std::copy(payload.begin(), payload.end(), ip.begin() + 40);
  return ethernet_packet(0x86dd, ip);
}

std::vector<std::byte> ipv6_fragment(std::uint16_t offset_bits,
                                     std::span<const std::byte> payload,
                                     std::uint8_t reserved_octet = 0) {
  std::vector<std::byte> fragment(8 + payload.size(), std::byte{0});
  fragment[0] = std::byte{17};
  fragment[1] = static_cast<std::byte>(reserved_octet);
  fragment[2] = static_cast<std::byte>(offset_bits >> 8U);
  fragment[3] = static_cast<std::byte>(offset_bits & 0xffU);
  fragment[7] = std::byte{1};
  std::copy(payload.begin(), payload.end(), fragment.begin() + 8);
  return ipv6_packet(44, fragment);
}

constexpr std::array<std::byte, 8> kUdpHeader{
    std::byte{0}, std::byte{1}, std::byte{0}, std::byte{2},
    std::byte{0}, std::byte{8}, std::byte{0}, std::byte{0},
};

sniffing::RawPacketView packet_view(const std::vector<std::byte> &bytes,
                                    std::uint64_t packet_id) {
  return sniffing::RawPacketView{
      .metadata =
          {
              .key =
                  {
                      .capture_id = {.high = 1, .low = 2},
                      .packet_id = packet_id,
                  },
              .captured_len = static_cast<std::uint32_t>(bytes.size()),
              .wire_len = static_cast<std::uint32_t>(bytes.size()),
              .link_type = 1,
          },
      .bytes = bytes,
  };
}

void ipv4_fragment_fields_and_units_are_explicit() {
  const auto registry = core_registry();
  PacketParser parser(registry);
  const auto packet = ipv4_fragment(1, kUdpHeader);
  const auto tree =
      parser.parse(pruftnet::tests::raw_packet_view(packet, packet.size()));
  assert(tree.condition() == ParseCondition::Complete);
  assert(node(tree, *registry, "ipv4.reserved_flag").value_low == 0);
  assert(node(tree, *registry, "ipv4.dont_fragment").value_low == 0);
  assert(node(tree, *registry, "ipv4.more_fragments").value_low == 0);
  assert(node(tree, *registry, "ipv4.fragment_offset_encoded").value_low == 1);
  assert(node(tree, *registry, "ipv4.fragment_offset").value_low == 8);
  assert(node_count(tree, *registry, "udp.datagram") == 0);
  assert(node(tree, *registry, "unknown.data").length == 8);
}

void invalid_ipv4_fragment_geometry_is_rejected() {
  const auto registry = core_registry();
  PacketParser parser(registry);

  const std::array<std::byte, 7> short_payload{};
  const auto misaligned = ipv4_fragment(0x2000, short_payload);
  assert(parser
             .parse(pruftnet::tests::raw_packet_view(misaligned,
                                                     misaligned.size()))
             .condition() == ParseCondition::Malformed);

  const auto valid_first = ipv4_fragment(0x2000, kUdpHeader);
  assert(parser
             .parse(pruftnet::tests::raw_packet_view(valid_first,
                                                     valid_first.size()))
             .condition() == ParseCondition::Complete);

  const auto contradictory = ipv4_fragment(0x6000, kUdpHeader);
  assert(parser
             .parse(pruftnet::tests::raw_packet_view(contradictory,
                                                     contradictory.size()))
             .condition() == ParseCondition::Malformed);

  const auto overflow = ipv4_fragment(0x1fff, kUdpHeader);
  assert(
      parser.parse(pruftnet::tests::raw_packet_view(overflow, overflow.size()))
          .condition() == ParseCondition::Malformed);

  const std::array<std::byte, 0> empty{};
  const auto empty_fragment = ipv4_fragment(0x2000, empty);
  assert(parser
             .parse(pruftnet::tests::raw_packet_view(empty_fragment,
                                                     empty_fragment.size()))
             .condition() == ParseCondition::Malformed);
}

void ipv6_atomic_and_reserved_fields_follow_the_wire_format() {
  const auto registry = core_registry();
  PacketParser parser(registry);

  const auto atomic = ipv6_fragment(0, kUdpHeader);
  const auto atomic_tree =
      parser.parse(pruftnet::tests::raw_packet_view(atomic, atomic.size()));
  assert(atomic_tree.condition() == ParseCondition::Complete);
  assert(node(atomic_tree, *registry, "ipv6.fragment_atomic").value_low == 1);
  assert(node(atomic_tree, *registry, "ipv6.extension").length == 8);
  assert(node_count(atomic_tree, *registry, "udp.datagram") == 1);

  const auto reserved = ipv6_fragment(0x0006, kUdpHeader, 0xaa);
  const auto reserved_tree =
      parser.parse(pruftnet::tests::raw_packet_view(reserved, reserved.size()));
  assert(reserved_tree.condition() == ParseCondition::Complete);
  assert(node(reserved_tree, *registry, "ipv6.fragment_reserved_octet")
             .value_low == 0xaa);
  assert(node(reserved_tree, *registry, "ipv6.fragment_reserved").value_low ==
         3);
  assert(node(reserved_tree, *registry, "ipv6.fragment_atomic").value_low == 1);
}

void invalid_ipv6_fragment_geometry_is_rejected() {
  const auto registry = core_registry();
  PacketParser parser(registry);

  const std::array<std::byte, 7> short_payload{};
  const auto misaligned = ipv6_fragment(1, short_payload);
  assert(parser
             .parse(pruftnet::tests::raw_packet_view(misaligned,
                                                     misaligned.size()))
             .condition() == ParseCondition::Malformed);

  const auto non_atomic = ipv6_fragment(1, kUdpHeader);
  const auto non_atomic_tree = parser.parse(
      pruftnet::tests::raw_packet_view(non_atomic, non_atomic.size()));
  assert(non_atomic_tree.condition() == ParseCondition::Complete);
  assert(node(non_atomic_tree, *registry, "ipv6.fragment_atomic").value_low ==
         0);
  assert(node_count(non_atomic_tree, *registry, "udp.datagram") == 0);

  const auto overflow = ipv6_fragment(0xfff8, kUdpHeader);
  assert(
      parser.parse(pruftnet::tests::raw_packet_view(overflow, overflow.size()))
          .condition() == ParseCondition::Malformed);

  const auto high_valid = ipv6_fragment(0xfff0, kUdpHeader);
  assert(parser
             .parse(pruftnet::tests::raw_packet_view(high_valid,
                                                     high_valid.size()))
             .condition() == ParseCondition::Complete);

  std::vector<std::byte> chained(8, std::byte{0});
  chained[0] = std::byte{44};
  const auto fragment = ipv6_fragment(0xfff0, kUdpHeader);
  const auto fragment_payload =
      std::span<const std::byte>(fragment).subspan(14 + 40);
  chained.insert(chained.end(), fragment_payload.begin(),
                 fragment_payload.end());
  const auto with_preceding_header = ipv6_packet(0, chained);
  assert(parser
             .parse(pruftnet::tests::raw_packet_view(
                 with_preceding_header, with_preceding_header.size()))
             .condition() == ParseCondition::Malformed);
}

void fragment_capture_boundaries_remain_partial() {
  const auto registry = core_registry();
  PacketParser parser(registry);

  const auto v4 = ipv4_fragment(0x2000, kUdpHeader);
  for (std::size_t captured = 0; captured < v4.size(); ++captured) {
    const auto span = std::span<const std::byte>(v4.data(), captured);
    assert(parser
               .parse(pruftnet::tests::raw_packet_view(
                   span, v4.size(), 1, pruftnet::sniffing::PacketFlagTruncated))
               .condition() == ParseCondition::Partial);
  }

  const auto v6 = ipv6_fragment(0, kUdpHeader);
  for (std::size_t captured = 0; captured < v6.size(); ++captured) {
    const auto span = std::span<const std::byte>(v6.data(), captured);
    assert(parser
               .parse(pruftnet::tests::raw_packet_view(
                   span, v6.size(), 1, pruftnet::sniffing::PacketFlagTruncated))
               .condition() == ParseCondition::Partial);
  }
}

void ipv4_fragments_reassemble_into_a_derived_transport_payload() {
  const auto registry = core_registry();
  PacketParser parser(registry);
  constexpr std::array first{
      std::byte{0x12}, std::byte{0x34}, std::byte{0x00}, std::byte{0x02},
      std::byte{0x00}, std::byte{0x0c}, std::byte{0x00}, std::byte{0x00},
  };
  constexpr std::array last{
      std::byte{'t'},
      std::byte{'e'},
      std::byte{'s'},
      std::byte{'t'},
  };
  const auto first_packet = ipv4_fragment(0x2000, first);
  const auto last_packet = ipv4_fragment(0x0001, last);

  const auto pending = parser.parse(packet_view(last_packet, 2));
  assert(pending.condition() == ParseCondition::Complete);
  assert(node_count(pending, *registry, "udp.datagram") == 0);

  const auto complete = parser.parse(packet_view(first_packet, 1));
  assert(complete.condition() == ParseCondition::Complete);
  assert(node_count(complete, *registry, "udp.datagram") == 1);
  assert(node(complete, *registry, "ipv4.reassembled").value_low == 1);
  assert(node(complete, *registry, "ipv4.reassembled_length").value_low == 12);
  assert(
      node(complete, *registry, "ipv4.reassembled_fragment_count").value_low ==
      2);
  assert(complete.data_sources().size() == 2);
  const auto &source = complete.data_sources()[1];
  assert(source.kind == DataSourceKind::Derived);
  assert(complete.source_name(source) == "Reassembled IPv4 payload");
  const auto contributors = complete.source_contributors(source);
  assert(contributors.size() == 2);
  assert(std::any_of(
      contributors.begin(), contributors.end(), [](const auto &item) {
        return item.packet_key.packet_id == 1 && item.destination_offset == 0 &&
               item.destination_length == 8;
      }));
  assert(std::any_of(
      contributors.begin(), contributors.end(), [](const auto &item) {
        return item.packet_key.packet_id == 2 && item.destination_offset == 8 &&
               item.destination_length == 4;
      }));
}

void ipv6_fragments_reassemble_and_resume_next_header_processing() {
  const auto registry = core_registry();
  PacketParser parser(registry);
  constexpr std::array first{
      std::byte{0x12}, std::byte{0x34}, std::byte{0x00}, std::byte{0x02},
      std::byte{0x00}, std::byte{0x0c}, std::byte{0x00}, std::byte{0x00},
  };
  constexpr std::array last{
      std::byte{'t'},
      std::byte{'e'},
      std::byte{'s'},
      std::byte{'t'},
  };
  const auto first_packet = ipv6_fragment(0x0001, first);
  const auto last_packet = ipv6_fragment(0x0008, last);

  const auto pending = parser.parse(packet_view(last_packet, 2));
  assert(pending.condition() == ParseCondition::Complete);
  assert(node_count(pending, *registry, "udp.datagram") == 0);

  const auto complete = parser.parse(packet_view(first_packet, 1));
  assert(complete.condition() == ParseCondition::Complete);
  assert(node_count(complete, *registry, "udp.datagram") == 1);
  assert(node(complete, *registry, "ipv6.reassembled").value_low == 1);
  assert(node(complete, *registry, "ipv6.reassembled_length").value_low == 12);
  assert(
      node(complete, *registry, "ipv6.reassembled_fragment_count").value_low ==
      2);
  assert(complete.data_sources().size() == 2);
  const auto &source = complete.data_sources()[1];
  assert(source.kind == DataSourceKind::Derived);
  assert(complete.source_name(source) == "Reassembled IPv6 payload");
  assert(complete.source_contributors(source).size() == 2);
}

} // namespace

int main() {
  ipv4_fragment_fields_and_units_are_explicit();
  invalid_ipv4_fragment_geometry_is_rejected();
  ipv6_atomic_and_reserved_fields_follow_the_wire_format();
  invalid_ipv6_fragment_geometry_is_rejected();
  fragment_capture_boundaries_remain_partial();
  ipv4_fragments_reassemble_into_a_derived_transport_payload();
  ipv6_fragments_reassemble_and_resume_next_header_processing();
}

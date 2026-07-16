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

RegistrySnapshotPtr core_registry() {
  auto result = make_core_registry();
  assert(std::holds_alternative<RegistrySnapshot>(result));
  return std::make_shared<const RegistrySnapshot>(
      std::move(std::get<RegistrySnapshot>(result)));
}

void set_u16(std::vector<std::byte> &bytes, std::size_t offset,
             std::uint16_t value) {
  bytes[offset] = static_cast<std::byte>(value >> 8U);
  bytes[offset + 1] = static_cast<std::byte>(value & 0xffU);
}

void set_u32(std::vector<std::byte> &bytes, std::size_t offset,
             std::uint32_t value) {
  bytes[offset] = static_cast<std::byte>(value >> 24U);
  bytes[offset + 1] = static_cast<std::byte>((value >> 16U) & 0xffU);
  bytes[offset + 2] = static_cast<std::byte>((value >> 8U) & 0xffU);
  bytes[offset + 3] = static_cast<std::byte>(value & 0xffU);
}

void append_u32(std::vector<std::byte> &bytes, std::uint32_t value) {
  const auto offset = bytes.size();
  bytes.resize(offset + 4);
  set_u32(bytes, offset, value);
}

std::vector<std::byte> ethernet_frame(std::uint16_t type,
                                      std::span<const std::byte> payload) {
  std::vector<std::byte> frame(14, std::byte{0});
  for (std::size_t index = 0; index < 6; ++index) {
    frame[index] = static_cast<std::byte>(index);
    frame[6 + index] = static_cast<std::byte>(0x10U + index);
  }
  set_u16(frame, 12, type);
  frame.insert(frame.end(), payload.begin(), payload.end());
  return frame;
}

std::vector<std::byte> ipv4_packet(std::uint8_t protocol,
                                   std::span<const std::byte> payload) {
  const auto total_length = static_cast<std::uint16_t>(20 + payload.size());
  std::vector<std::byte> packet(20, std::byte{0});
  packet[0] = std::byte{0x45};
  set_u16(packet, 2, total_length);
  set_u16(packet, 4, 0x1234);
  packet[8] = std::byte{64};
  packet[9] = static_cast<std::byte>(protocol);
  packet[12] = std::byte{192};
  packet[13] = std::byte{0};
  packet[14] = std::byte{2};
  packet[15] = std::byte{1};
  packet[16] = std::byte{198};
  packet[17] = std::byte{51};
  packet[18] = std::byte{100};
  packet[19] = std::byte{2};
  packet.insert(packet.end(), payload.begin(), payload.end());
  return packet;
}

std::vector<std::byte> udp_frame(std::uint16_t destination_port,
                                 std::span<const std::byte> payload) {
  auto frame = pruftnet::tests::ethernet_ipv4_udp_packet(payload);
  set_u16(frame, 34, 50000);
  set_u16(frame, 36, destination_port);
  return frame;
}

std::uint16_t checksum(std::span<const std::byte> bytes) {
  std::uint32_t sum = 0;
  std::size_t offset = 0;
  while (offset + 1 < bytes.size()) {
    sum += (static_cast<std::uint32_t>(
                std::to_integer<std::uint8_t>(bytes[offset]))
            << 8U) |
           std::to_integer<std::uint8_t>(bytes[offset + 1]);
    offset += 2;
  }
  if (offset < bytes.size()) {
    sum +=
        static_cast<std::uint32_t>(std::to_integer<std::uint8_t>(bytes[offset]))
        << 8U;
  }
  while ((sum >> 16U) != 0) {
    sum = (sum & 0xffffU) + (sum >> 16U);
  }
  return static_cast<std::uint16_t>(~sum);
}

std::vector<std::byte> inner_ethernet() {
  return pruftnet::tests::ethernet_ipv4_udp_packet();
}

std::vector<std::byte> inner_ipv4() {
  const auto ethernet = inner_ethernet();
  return {ethernet.begin() + 14, ethernet.end()};
}

void ip_in_ip_reuses_the_native_ip_dissectors() {
  const auto registry = core_registry();
  PacketParser parser(registry);
  const auto inner = inner_ipv4();
  const auto outer_ip = ipv4_packet(4, inner);
  const auto frame = ethernet_frame(0x0800, outer_ip);
  const auto tree =
      parser.parse(pruftnet::tests::raw_packet_view(frame, frame.size()));
  assert(tree.condition() == ParseCondition::Complete);
  assert(node_count(tree, *registry, "ipv4.packet") == 2);

  std::vector<std::byte> ipv6(40, std::byte{0});
  ipv6[0] = std::byte{0x60};
  set_u16(ipv6, 4, static_cast<std::uint16_t>(inner.size()));
  ipv6[6] = std::byte{4};
  ipv6[7] = std::byte{64};
  ipv6.insert(ipv6.end(), inner.begin(), inner.end());
  const auto ipv6_frame = ethernet_frame(0x86dd, ipv6);
  const auto ipv6_tree = parser.parse(
      pruftnet::tests::raw_packet_view(ipv6_frame, ipv6_frame.size()));
  assert(ipv6_tree.condition() == ParseCondition::Complete);
  assert(node_count(ipv6_tree, *registry, "ipv6.packet") == 1);
  assert(node_count(ipv6_tree, *registry, "ipv4.packet") == 1);
}

void gre_extensions_routing_and_nested_payloads_are_bounded() {
  const auto registry = core_registry();
  PacketParser parser(registry);
  const auto inner = inner_ipv4();

  std::vector<std::byte> gre(16, std::byte{0});
  set_u16(gre, 0, 0xb000);
  set_u16(gre, 2, 0x0800);
  set_u32(gre, 8, 0x10203040);
  set_u32(gre, 12, 7);
  gre.insert(gre.end(), inner.begin(), inner.end());
  set_u16(gre, 4, checksum(gre));
  const auto outer_ip = ipv4_packet(47, gre);
  const auto frame = ethernet_frame(0x0800, outer_ip);
  const auto tree =
      parser.parse(pruftnet::tests::raw_packet_view(frame, frame.size()));
  assert(tree.condition() == ParseCondition::Complete);
  assert(node(tree, *registry, "gre.version").value_low == 0);
  assert(node(tree, *registry, "gre.checksum_valid").value_low == 1);
  assert(node(tree, *registry, "gre.key").value_low == 0x10203040);
  assert(node(tree, *registry, "gre.sequence_number").value_low == 7);
  assert(node_count(tree, *registry, "ipv4.packet") == 2);

  std::vector<std::byte> routed(16, std::byte{0});
  set_u16(routed, 0, 0x4000);
  set_u16(routed, 2, 0x0800);
  set_u16(routed, 8, 1);
  routed[11] = std::byte{4};
  routed[12] = std::byte{1};
  routed[13] = std::byte{2};
  routed[14] = std::byte{3};
  routed[15] = std::byte{4};
  routed.resize(20, std::byte{0});
  routed.insert(routed.end(), inner.begin(), inner.end());
  const auto routed_ip = ipv4_packet(47, routed);
  const auto routed_frame = ethernet_frame(0x0800, routed_ip);
  const auto routed_tree = parser.parse(
      pruftnet::tests::raw_packet_view(routed_frame, routed_frame.size()));
  assert(routed_tree.condition() == ParseCondition::Complete);
  assert(node_count(routed_tree, *registry, "gre.routing_entry") == 2);
}

void vxlan_and_geneve_dispatch_inner_ethernet_and_network_payloads() {
  const auto registry = core_registry();
  PacketParser parser(registry);
  const auto ethernet = inner_ethernet();

  std::vector<std::byte> vxlan{
      std::byte{0x08}, std::byte{0},    std::byte{0},    std::byte{0},
      std::byte{0x01}, std::byte{0x02}, std::byte{0x03}, std::byte{0},
  };
  vxlan.insert(vxlan.end(), ethernet.begin(), ethernet.end());
  const auto vxlan_frame = udp_frame(4789, vxlan);
  const auto vxlan_tree = parser.parse(
      pruftnet::tests::raw_packet_view(vxlan_frame, vxlan_frame.size()));
  assert(vxlan_tree.condition() == ParseCondition::Complete);
  assert(node(vxlan_tree, *registry, "vxlan.vni").value_low == 0x010203);
  assert(node_count(vxlan_tree, *registry, "eth.frame") == 2);

  const auto ip = inner_ipv4();
  std::vector<std::byte> gpe{
      std::byte{0x0c}, std::byte{0},    std::byte{0},    std::byte{1},
      std::byte{0x01}, std::byte{0x02}, std::byte{0x03}, std::byte{0},
  };
  gpe.insert(gpe.end(), ip.begin(), ip.end());
  const auto gpe_frame = udp_frame(4790, gpe);
  const auto gpe_tree = parser.parse(
      pruftnet::tests::raw_packet_view(gpe_frame, gpe_frame.size()));
  assert(gpe_tree.condition() == ParseCondition::Complete);
  assert(node(gpe_tree, *registry, "vxlan.next_protocol").value_low == 1);
  assert(node_count(gpe_tree, *registry, "ipv4.packet") == 2);

  std::vector<std::byte> geneve{
      std::byte{0x02}, std::byte{0x40}, std::byte{0x65}, std::byte{0x58},
      std::byte{0x0a}, std::byte{0x0b}, std::byte{0x0c}, std::byte{0},
      std::byte{0x01}, std::byte{0x02}, std::byte{0x81}, std::byte{0x01},
      std::byte{1},    std::byte{2},    std::byte{3},    std::byte{4},
  };
  geneve.insert(geneve.end(), ethernet.begin(), ethernet.end());
  const auto geneve_frame = udp_frame(6081, geneve);
  const auto geneve_tree = parser.parse(
      pruftnet::tests::raw_packet_view(geneve_frame, geneve_frame.size()));
  assert(geneve_tree.condition() == ParseCondition::Complete);
  assert(node(geneve_tree, *registry, "geneve.vni").value_low == 0x0a0b0c);
  assert(node(geneve_tree, *registry, "geneve.option.critical").value_low == 1);
  assert(node_count(geneve_tree, *registry, "geneve.option") == 1);
  assert(node_count(geneve_tree, *registry, "eth.frame") == 2);
}

void mpls_stacks_explicit_null_and_gach_are_structured() {
  const auto registry = core_registry();
  PacketParser parser(registry);
  const auto ip = inner_ipv4();

  std::vector<std::byte> mpls;
  append_u32(mpls, (16U << 12U) | (2U << 9U) | 64U);
  append_u32(mpls, (0U << 12U) | (1U << 8U) | 63U);
  mpls.insert(mpls.end(), ip.begin(), ip.end());
  const auto frame = ethernet_frame(0x8847, mpls);
  const auto tree =
      parser.parse(pruftnet::tests::raw_packet_view(frame, frame.size()));
  assert(tree.condition() == ParseCondition::Complete);
  assert(node_count(tree, *registry, "mpls.entry") == 2);
  assert(node(tree, *registry, "mpls.payload_protocol").value_low == 0x0800);
  assert(node_count(tree, *registry, "ipv4.packet") == 1);

  std::vector<std::byte> gach;
  append_u32(gach, (13U << 12U) | (1U << 8U) | 64U);
  gach.push_back(std::byte{0x10});
  gach.push_back(std::byte{0});
  gach.push_back(std::byte{0x00});
  gach.push_back(std::byte{0x21});
  gach.insert(gach.end(), ip.begin(), ip.end());
  const auto gach_frame = ethernet_frame(0x8847, gach);
  const auto gach_tree = parser.parse(
      pruftnet::tests::raw_packet_view(gach_frame, gach_frame.size()));
  assert(gach_tree.condition() == ParseCondition::Complete);
  assert(node(gach_tree, *registry, "mpls.gach.channel_type").value_low ==
         0x0021);
  assert(node_count(gach_tree, *registry, "ipv4.packet") == 1);
}

void malformed_headers_and_capture_truncation_remain_distinct() {
  const auto registry = core_registry();
  PacketParser parser(registry);

  const std::vector<std::byte> invalid_vxlan(8, std::byte{0});
  const auto invalid_vxlan_frame = udp_frame(4789, invalid_vxlan);
  assert(parser
             .parse(pruftnet::tests::raw_packet_view(
                 invalid_vxlan_frame, invalid_vxlan_frame.size()))
             .condition() == ParseCondition::Malformed);

  std::vector<std::byte> invalid_mpls;
  append_u32(invalid_mpls, (3U << 12U) | (1U << 8U) | 64U);
  invalid_mpls.push_back(std::byte{0x45});
  const auto invalid_mpls_frame = ethernet_frame(0x8847, invalid_mpls);
  assert(parser
             .parse(pruftnet::tests::raw_packet_view(invalid_mpls_frame,
                                                     invalid_mpls_frame.size()))
             .condition() == ParseCondition::Malformed);

  std::vector<std::byte> complete_mpls;
  append_u32(complete_mpls, (16U << 12U) | (1U << 8U) | 64U);
  complete_mpls.insert(complete_mpls.end(), 20, std::byte{0});
  complete_mpls[4] = std::byte{0x45};
  set_u16(complete_mpls, 6, 20);
  const auto complete_frame = ethernet_frame(0x8847, complete_mpls);
  auto truncated = complete_frame;
  truncated.resize(16);
  assert(parser
             .parse(pruftnet::tests::raw_packet_view(
                 truncated, static_cast<std::uint32_t>(complete_frame.size())))
             .condition() == ParseCondition::Partial);
}

} // namespace

int main() {
  ip_in_ip_reuses_the_native_ip_dissectors();
  gre_extensions_routing_and_nested_payloads_are_bounded();
  vxlan_and_geneve_dispatch_inner_ethernet_and_network_payloads();
  mpls_stacks_explicit_null_and_gach_are_structured();
  malformed_headers_and_capture_truncation_remain_distinct();
}

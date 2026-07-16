#include <algorithm>
#include <array>
#include <cassert>
#include <cstddef>
#include <cstdint>
#include <memory>
#include <span>
#include <variant>
#include <vector>

#include "parsing/core_link_types.hpp"
#include "parsing/packet_parser.hpp"
#include "pruftnet/parsing/registry.hpp"
#include "tests/support/ethernet_ipv4_udp_fixture.hpp"
#include "tests/support/parsed_tree_test_support.hpp"

namespace {

using namespace pruftnet::parsing;
using namespace pruftnet::parsing::internal;
using pruftnet::tests::node;
using pruftnet::tests::node_count;

RegistrySnapshotPtr core_registry() {
  auto result = make_core_registry();
  assert(std::holds_alternative<RegistrySnapshot>(result));
  return std::make_shared<const RegistrySnapshot>(
      std::move(std::get<RegistrySnapshot>(result)));
}

std::vector<std::byte> ipv4_udp_payload() {
  auto ethernet = pruftnet::tests::ethernet_ipv4_udp_packet();
  return {ethernet.begin() + 14, ethernet.end()};
}

std::vector<std::byte> snap_ipv4_payload() {
  std::vector<std::byte> bytes{
      std::byte{0xaa}, std::byte{0xaa}, std::byte{0x03}, std::byte{0x00},
      std::byte{0x00}, std::byte{0x00}, std::byte{0x08}, std::byte{0x00},
  };
  const auto ip = ipv4_udp_payload();
  bytes.insert(bytes.end(), ip.begin(), ip.end());
  return bytes;
}

std::vector<std::byte> ethernet_packet(std::uint16_t type_or_length,
                                       std::span<const std::byte> payload) {
  std::vector<std::byte> bytes(14, std::byte{0});
  bytes[12] = static_cast<std::byte>(type_or_length >> 8U);
  bytes[13] = static_cast<std::byte>(type_or_length);
  bytes.insert(bytes.end(), payload.begin(), payload.end());
  return bytes;
}

std::vector<std::byte> linux_cooked_v1(std::uint16_t protocol,
                                       std::span<const std::byte> payload) {
  std::vector<std::byte> bytes(16, std::byte{0});
  bytes[3] = std::byte{1};
  bytes[4] = std::byte{0};
  bytes[5] = std::byte{6};
  bytes[14] = static_cast<std::byte>(protocol >> 8U);
  bytes[15] = static_cast<std::byte>(protocol);
  bytes.insert(bytes.end(), payload.begin(), payload.end());
  return bytes;
}

void ethernet_and_vlan_lengths_dispatch_llc_snap_and_separate_trailers() {
  const auto registry = core_registry();
  PacketParser parser(registry);
  const auto snap = snap_ipv4_payload();

  auto ethernet =
      ethernet_packet(static_cast<std::uint16_t>(snap.size()), snap);
  ethernet.insert(ethernet.end(), 10, std::byte{0});
  const auto ethernet_tree =
      parser.parse(pruftnet::tests::raw_packet_view(ethernet, ethernet.size()));
  assert(ethernet_tree.condition() == ParseCondition::Complete);
  assert(node_count(ethernet_tree, *registry, "llc.packet") == 1);
  assert(node_count(ethernet_tree, *registry, "snap.packet") == 1);
  assert(node_count(ethernet_tree, *registry, "ipv4.packet") == 1);
  assert(node_count(ethernet_tree, *registry, "udp.datagram") == 1);
  assert(node(ethernet_tree, *registry, "eth.trailer").length == 10);

  std::vector<std::byte> tagged_payload{
      std::byte{0x00},
      std::byte{0x07},
      static_cast<std::byte>(snap.size() >> 8U),
      static_cast<std::byte>(snap.size()),
  };
  tagged_payload.insert(tagged_payload.end(), snap.begin(), snap.end());
  tagged_payload.insert(tagged_payload.end(), 12, std::byte{0});
  const auto tagged = ethernet_packet(0x8100, tagged_payload);
  const auto tagged_tree =
      parser.parse(pruftnet::tests::raw_packet_view(tagged, tagged.size()));
  assert(tagged_tree.condition() == ParseCondition::Complete);
  assert(node_count(tagged_tree, *registry, "llc.packet") == 1);
  assert(node_count(tagged_tree, *registry, "snap.packet") == 1);
  assert(node_count(tagged_tree, *registry, "udp.datagram") == 1);
  assert(node(tagged_tree, *registry, "vlan.trailer").length == 12);
  assert(node_count(tagged_tree, *registry, "eth.trailer") == 0);
}

void invalid_and_overlong_lengths_are_malformed_without_guessing() {
  const auto registry = core_registry();
  PacketParser parser(registry);
  const std::array payload{
      std::byte{0xaa}, std::byte{0xaa}, std::byte{0x03}, std::byte{0},
      std::byte{0},    std::byte{0},    std::byte{0x08}, std::byte{0},
  };

  const auto invalid = ethernet_packet(1501, payload);
  const auto invalid_tree =
      parser.parse(pruftnet::tests::raw_packet_view(invalid, invalid.size()));
  assert(invalid_tree.condition() == ParseCondition::Malformed);
  assert(node_count(invalid_tree, *registry, "llc.packet") == 0);
  assert(node(invalid_tree, *registry, "unknown.data").length ==
         payload.size());

  const auto overlong = ethernet_packet(20, payload);
  const auto overlong_tree =
      parser.parse(pruftnet::tests::raw_packet_view(overlong, overlong.size()));
  assert(overlong_tree.condition() == ParseCondition::Malformed);
  assert(node_count(overlong_tree, *registry, "llc.packet") == 0);
  assert(node(overlong_tree, *registry, "unknown.data").length ==
         payload.size());
}

void raw_8023_ipx_and_non_information_snap_remain_opaque() {
  const auto registry = core_registry();
  PacketParser parser(registry);
  const std::array raw_ipx{
      std::byte{0xff},
      std::byte{0xff},
      std::byte{1},
      std::byte{2},
  };
  auto raw =
      ethernet_packet(static_cast<std::uint16_t>(raw_ipx.size()), raw_ipx);
  raw.insert(raw.end(), 3, std::byte{0});
  const auto raw_tree =
      parser.parse(pruftnet::tests::raw_packet_view(raw, raw.size()));
  assert(raw_tree.condition() == ParseCondition::Complete);
  assert(node_count(raw_tree, *registry, "llc.packet") == 0);
  assert(node(raw_tree, *registry, "unknown.data").length == raw_ipx.size());
  assert(node(raw_tree, *registry, "eth.trailer").length == 3);

  std::vector<std::byte> test_frame{
      std::byte{0xaa}, std::byte{0xaa}, std::byte{0xe3}, std::byte{0},
      std::byte{0},    std::byte{0},    std::byte{0x08}, std::byte{0},
  };
  const auto ip = ipv4_udp_payload();
  test_frame.insert(test_frame.end(), ip.begin(), ip.end());
  const auto non_information = ethernet_packet(
      static_cast<std::uint16_t>(test_frame.size()), test_frame);
  const auto non_information_tree =
      parser.parse(pruftnet::tests::raw_packet_view(non_information,
                                                    non_information.size()));
  assert(non_information_tree.condition() == ParseCondition::Complete);
  assert(node_count(non_information_tree, *registry, "snap.packet") == 1);
  assert(node_count(non_information_tree, *registry, "ipv4.packet") == 0);
  assert(node(non_information_tree, *registry, "unknown.data").length ==
         ip.size());
}

void sll_llc_dispatch_and_extended_control_are_explicit() {
  const auto registry = core_registry();
  PacketParser parser(registry);
  const auto definition =
      std::ranges::find(core_link_types(), CoreLinkTypeKind::LinuxCookedV1,
                        &CoreLinkTypeDefinition::kind);
  if (definition != core_link_types().end()) {
    const auto snap = snap_ipv4_payload();
    const auto cooked = linux_cooked_v1(0x0004, snap);
    const auto tree = parser.parse(pruftnet::tests::raw_packet_view(
        cooked, cooked.size(), static_cast<std::uint32_t>(definition->value)));
    assert(tree.condition() == ParseCondition::Complete);
    assert(node_count(tree, *registry, "llc.packet") == 1);
    assert(node_count(tree, *registry, "snap.packet") == 1);
    assert(node_count(tree, *registry, "udp.datagram") == 1);
  }

  const std::array extended{
      std::byte{0x06}, std::byte{0x06}, std::byte{0x00},
      std::byte{0x12}, std::byte{0x5a},
  };
  const auto bytes =
      ethernet_packet(static_cast<std::uint16_t>(extended.size()), extended);
  const auto tree =
      parser.parse(pruftnet::tests::raw_packet_view(bytes, bytes.size()));
  assert(tree.condition() == ParseCondition::Complete);
  assert(node(tree, *registry, "llc.control").value_low == 0x1200);
  assert(node(tree, *registry, "llc.control").length == 2);
  assert(node(tree, *registry, "llc.control_length").value_low == 2);
  assert(node(tree, *registry, "unknown.data").length == 1);
}

void every_llc_snap_capture_boundary_is_safe() {
  const auto registry = core_registry();
  PacketParser parser(registry);
  const auto snap = snap_ipv4_payload();
  const auto bytes =
      ethernet_packet(static_cast<std::uint16_t>(snap.size()), snap);
  for (std::size_t captured = 0; captured < bytes.size(); ++captured) {
    const auto truncated = std::span<const std::byte>(bytes.data(), captured);
    const auto tree = parser.parse(pruftnet::tests::raw_packet_view(
        truncated, bytes.size(), 1, pruftnet::sniffing::PacketFlagTruncated));
    assert(tree.condition() == ParseCondition::Partial);
  }
}

} // namespace

int main() {
  ethernet_and_vlan_lengths_dispatch_llc_snap_and_separate_trailers();
  invalid_and_overlong_lengths_are_malformed_without_guessing();
  raw_8023_ipx_and_non_information_snap_remain_opaque();
  sll_llc_dispatch_and_extended_control_are_explicit();
  every_llc_snap_capture_boundary_is_safe();
}

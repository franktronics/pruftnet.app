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

std::vector<std::byte> linux_cooked_v1(std::uint16_t protocol,
                                       std::span<const std::byte> payload,
                                       std::uint16_t address_length = 6) {
  std::vector<std::byte> bytes(16, std::byte{0});
  bytes[3] = std::byte{1};
  bytes[4] = static_cast<std::byte>(address_length >> 8U);
  bytes[5] = static_cast<std::byte>(address_length);
  bytes[6] = std::byte{0x00};
  bytes[7] = std::byte{0x11};
  bytes[8] = std::byte{0x22};
  bytes[9] = std::byte{0x33};
  bytes[10] = std::byte{0x44};
  bytes[11] = std::byte{0x55};
  bytes[14] = static_cast<std::byte>(protocol >> 8U);
  bytes[15] = static_cast<std::byte>(protocol);
  bytes.insert(bytes.end(), payload.begin(), payload.end());
  return bytes;
}

std::vector<std::byte> linux_cooked_v2(std::uint16_t protocol,
                                       std::span<const std::byte> payload,
                                       std::uint16_t reserved = 0) {
  std::vector<std::byte> bytes(20, std::byte{0});
  bytes[0] = static_cast<std::byte>(protocol >> 8U);
  bytes[1] = static_cast<std::byte>(protocol);
  bytes[2] = static_cast<std::byte>(reserved >> 8U);
  bytes[3] = static_cast<std::byte>(reserved);
  bytes[7] = std::byte{7};
  bytes[9] = std::byte{1};
  bytes[11] = std::byte{6};
  bytes[12] = std::byte{0x66};
  bytes[13] = std::byte{0x77};
  bytes[14] = std::byte{0x88};
  bytes[15] = std::byte{0x99};
  bytes[16] = std::byte{0xaa};
  bytes[17] = std::byte{0xbb};
  bytes.insert(bytes.end(), payload.begin(), payload.end());
  return bytes;
}

std::vector<std::byte> null_packet(std::span<const std::byte> payload,
                                   bool network_byte_order) {
  std::vector<std::byte> bytes;
  if (network_byte_order) {
    pruftnet::tests::append_packet_bytes(bytes, {0, 0, 0, 2});
  } else {
    pruftnet::tests::append_packet_bytes(bytes, {2, 0, 0, 0});
  }
  bytes.insert(bytes.end(), payload.begin(), payload.end());
  return bytes;
}

std::vector<std::byte> packet_for(CoreLinkTypeKind kind) {
  const auto ip = ipv4_udp_payload();
  switch (kind) {
  case CoreLinkTypeKind::Ethernet:
    return pruftnet::tests::ethernet_ipv4_udp_packet();
  case CoreLinkTypeKind::LinuxCookedV1:
    return linux_cooked_v1(0x0800, ip);
  case CoreLinkTypeKind::LinuxCookedV2:
    return linux_cooked_v2(0x0800, ip);
  case CoreLinkTypeKind::Null:
    return null_packet(ip, false);
  case CoreLinkTypeKind::Loop:
    return null_packet(ip, true);
  case CoreLinkTypeKind::Raw:
    return ip;
  }
  return {};
}

void every_advertised_link_type_reaches_ipv4_and_udp() {
  const auto registry = core_registry();
  PacketParser parser(registry);
  for (const auto &definition : core_link_types()) {
    const auto bytes = packet_for(definition.kind);
    const auto tree = parser.parse(pruftnet::tests::raw_packet_view(
        bytes, static_cast<std::uint32_t>(bytes.size()),
        static_cast<std::uint32_t>(definition.value)));
    assert(tree.condition() == ParseCondition::Complete);
    assert(node_count(tree, *registry, "ipv4.packet") == 1);
    assert(node_count(tree, *registry, "udp.datagram") == 1);
  }
}

void cooked_headers_expose_version_specific_fields_and_bounds() {
  const auto registry = core_registry();
  PacketParser parser(registry);
  const auto ip = ipv4_udp_payload();

  const auto v1_definition =
      std::ranges::find(core_link_types(), CoreLinkTypeKind::LinuxCookedV1,
                        &CoreLinkTypeDefinition::kind);
  if (v1_definition != core_link_types().end()) {
    const auto bytes = linux_cooked_v1(0x0800, ip);
    const auto tree = parser.parse(pruftnet::tests::raw_packet_view(
        bytes, static_cast<std::uint32_t>(bytes.size()),
        static_cast<std::uint32_t>(v1_definition->value)));
    assert(node(tree, *registry, "sll.version").value_low == 1);
    assert(node(tree, *registry, "sll.hardware_type").value_low == 1);
    assert(node(tree, *registry, "sll.address_length").value_low == 6);
    assert(node(tree, *registry, "sll.address").length == 6);
    assert(node(tree, *registry, "sll.address_padding").length == 2);

    const auto oversized = linux_cooked_v1(0x0800, ip, 9);
    assert(parser
               .parse(pruftnet::tests::raw_packet_view(
                   oversized, static_cast<std::uint32_t>(oversized.size()),
                   static_cast<std::uint32_t>(v1_definition->value)))
               .condition() == ParseCondition::Malformed);
  }

  const auto v2_definition =
      std::ranges::find(core_link_types(), CoreLinkTypeKind::LinuxCookedV2,
                        &CoreLinkTypeDefinition::kind);
  if (v2_definition != core_link_types().end()) {
    const auto bytes = linux_cooked_v2(0x0800, ip);
    const auto tree = parser.parse(pruftnet::tests::raw_packet_view(
        bytes, static_cast<std::uint32_t>(bytes.size()),
        static_cast<std::uint32_t>(v2_definition->value)));
    assert(node(tree, *registry, "sll.version").value_low == 2);
    assert(node(tree, *registry, "sll.interface_index").value_low == 7);
    assert(node(tree, *registry, "sll.reserved").value_low == 0);

    const auto reserved = linux_cooked_v2(0x0800, ip, 1);
    assert(parser
               .parse(pruftnet::tests::raw_packet_view(
                   reserved, static_cast<std::uint32_t>(reserved.size()),
                   static_cast<std::uint32_t>(v2_definition->value)))
               .condition() == ParseCondition::Malformed);
  }
}

void cooked_ethernet_protocol_dispatches_a_complete_frame() {
  const auto definition =
      std::ranges::find(core_link_types(), CoreLinkTypeKind::LinuxCookedV1,
                        &CoreLinkTypeDefinition::kind);
  if (definition == core_link_types().end()) {
    return;
  }
  const auto registry = core_registry();
  PacketParser parser(registry);
  const auto ethernet = pruftnet::tests::ethernet_ipv4_udp_packet();
  const auto bytes = linux_cooked_v1(0x0003, ethernet);
  const auto tree = parser.parse(pruftnet::tests::raw_packet_view(
      bytes, static_cast<std::uint32_t>(bytes.size()),
      static_cast<std::uint32_t>(definition->value)));
  assert(tree.condition() == ParseCondition::Complete);
  assert(node_count(tree, *registry, "eth.frame") == 1);
  assert(node_count(tree, *registry, "udp.datagram") == 1);
}

void every_link_header_capture_boundary_is_safe() {
  const auto registry = core_registry();
  PacketParser parser(registry);
  for (const auto &definition : core_link_types()) {
    const auto bytes = packet_for(definition.kind);
    for (std::size_t captured = 0; captured < bytes.size(); ++captured) {
      const auto truncated = std::span<const std::byte>(bytes.data(), captured);
      const auto tree = parser.parse(pruftnet::tests::raw_packet_view(
          truncated, static_cast<std::uint32_t>(bytes.size()),
          static_cast<std::uint32_t>(definition.value),
          pruftnet::sniffing::PacketFlagTruncated));
      assert(tree.condition() == ParseCondition::Partial);
    }
  }
}

} // namespace

int main() {
  every_advertised_link_type_reaches_ipv4_and_udp();
  cooked_headers_expose_version_specific_fields_and_bounds();
  cooked_ethernet_protocol_dispatches_a_complete_frame();
  every_link_header_capture_boundary_is_safe();
}

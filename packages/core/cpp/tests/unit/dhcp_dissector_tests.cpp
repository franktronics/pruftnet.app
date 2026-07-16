#include <cassert>
#include <cstddef>
#include <cstdint>
#include <memory>
#include <string_view>
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

void append_option(std::vector<std::byte> &bytes, std::uint8_t code,
                   std::initializer_list<std::uint8_t> value) {
  bytes.push_back(static_cast<std::byte>(code));
  bytes.push_back(static_cast<std::byte>(value.size()));
  for (const auto byte : value) {
    bytes.push_back(static_cast<std::byte>(byte));
  }
}

std::vector<std::byte> dhcp_base() {
  std::vector<std::byte> bytes(240, std::byte{0});
  bytes[0] = std::byte{1};
  bytes[1] = std::byte{1};
  bytes[2] = std::byte{6};
  set_u32(bytes, 4, 0x12345678);
  set_u16(bytes, 10, 0x8000);
  bytes[28] = std::byte{0x00};
  bytes[29] = std::byte{0x11};
  bytes[30] = std::byte{0x22};
  bytes[31] = std::byte{0x33};
  bytes[32] = std::byte{0x44};
  bytes[33] = std::byte{0x55};
  set_u32(bytes, 236, 0x63825363);
  return bytes;
}

std::vector<std::byte> udp_packet(std::span<const std::byte> payload,
                                  std::uint16_t source = 68,
                                  std::uint16_t destination = 67) {
  auto packet = pruftnet::tests::ethernet_ipv4_udp_packet(payload);
  set_u16(packet, 34, source);
  set_u16(packet, 36, destination);
  return packet;
}

void discover_options_and_relay_suboptions_are_structured() {
  const auto registry = core_registry();
  PacketParser parser(registry);
  auto message = dhcp_base();
  append_option(message, 53, {1});
  append_option(message, 55, {1, 3, 6});
  append_option(message, 57, {0x02, 0x40});
  append_option(message, 61, {1, 0, 17, 34, 51, 68, 85});
  append_option(message, 82, {1, 4, 0xde, 0xad, 0xbe, 0xef});
  message.push_back(std::byte{0xff});

  const auto packet = udp_packet(message);
  const auto tree =
      parser.parse(pruftnet::tests::raw_packet_view(packet, packet.size()));
  assert(tree.condition() == ParseCondition::Complete);
  assert(node_count(tree, *registry, "dhcp.message") == 1);
  assert(node_count(tree, *registry, "udp.payload") == 0);
  assert(node(tree, *registry, "dhcp.transaction_id").value_low == 0x12345678);
  assert(node(tree, *registry, "dhcp.broadcast").value_low == 1);
  assert(node(tree, *registry, "dhcp.message_type").value_low == 1);
  assert(node_count(tree, *registry, "dhcp.parameter_request") == 3);
  assert(node(tree, *registry, "dhcp.maximum_message_size").value_low == 576);
  assert(node(tree, *registry, "dhcp.relay_suboption.code").value_low == 1);
  assert(node(tree, *registry, "dhcp.relay_suboption.data").length == 4);
}

void overloaded_fields_are_parsed_as_options() {
  const auto registry = core_registry();
  PacketParser parser(registry);
  auto message = dhcp_base();
  message[108] = std::byte{12};
  message[109] = std::byte{4};
  message[110] = std::byte{'h'};
  message[111] = std::byte{'o'};
  message[112] = std::byte{'s'};
  message[113] = std::byte{'t'};
  message[114] = std::byte{0xff};
  append_option(message, 52, {1});
  append_option(message, 53, {2});
  message.push_back(std::byte{0xff});

  const auto packet = udp_packet(message);
  const auto tree =
      parser.parse(pruftnet::tests::raw_packet_view(packet, packet.size()));
  assert(tree.condition() == ParseCondition::Complete);
  assert(node(tree, *registry, "dhcp.overload").value_low == 1);
  assert(tree.node_text(node(tree, *registry, "dhcp.host_name")) == "host");
  assert(node_count(tree, *registry, "dhcp.boot_file") == 0);
}

void bootp_vendor_data_and_invalid_dhcp_options_are_distinct() {
  const auto registry = core_registry();
  PacketParser parser(registry);

  auto bootp = dhcp_base();
  set_u32(bootp, 236, 0x01020304);
  bootp.insert(bootp.end(), 12, std::byte{0xaa});
  const auto bootp_packet = udp_packet(bootp, 67, 68);
  const auto bootp_tree = parser.parse(
      pruftnet::tests::raw_packet_view(bootp_packet, bootp_packet.size()));
  assert(bootp_tree.condition() == ParseCondition::Complete);
  assert(node_count(bootp_tree, *registry, "dhcp.magic_cookie") == 0);
  assert(node(bootp_tree, *registry, "dhcp.trailing").length == 16);

  auto malformed = dhcp_base();
  malformed.push_back(std::byte{53});
  malformed.push_back(std::byte{4});
  malformed.push_back(std::byte{1});
  const auto malformed_packet = udp_packet(malformed);
  const auto malformed_tree = parser.parse(pruftnet::tests::raw_packet_view(
      malformed_packet, malformed_packet.size()));
  assert(malformed_tree.condition() == ParseCondition::Malformed);
}

void capture_truncation_remains_partial() {
  const auto registry = core_registry();
  PacketParser parser(registry);
  auto message = dhcp_base();
  append_option(message, 53, {1});
  message.push_back(std::byte{0xff});
  const auto complete = udp_packet(message);
  auto truncated = complete;
  truncated.resize(truncated.size() - 2);
  const auto tree = parser.parse(pruftnet::tests::raw_packet_view(
      truncated, static_cast<std::uint32_t>(complete.size())));
  assert(tree.condition() == ParseCondition::Partial);
}

} // namespace

int main() {
  discover_options_and_relay_suboptions_are_structured();
  overloaded_fields_are_parsed_as_options();
  bootp_vendor_data_and_invalid_dhcp_options_are_distinct();
  capture_truncation_remains_partial();
}

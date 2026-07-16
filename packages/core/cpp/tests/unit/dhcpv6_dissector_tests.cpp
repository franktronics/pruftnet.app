#include <algorithm>
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

void append_u16(std::vector<std::byte> &bytes, std::uint16_t value) {
  bytes.push_back(static_cast<std::byte>(value >> 8U));
  bytes.push_back(static_cast<std::byte>(value & 0xffU));
}

void append_u32(std::vector<std::byte> &bytes, std::uint32_t value) {
  bytes.push_back(static_cast<std::byte>(value >> 24U));
  bytes.push_back(static_cast<std::byte>((value >> 16U) & 0xffU));
  bytes.push_back(static_cast<std::byte>((value >> 8U) & 0xffU));
  bytes.push_back(static_cast<std::byte>(value & 0xffU));
}

void append_option(std::vector<std::byte> &bytes, std::uint16_t code,
                   std::span<const std::byte> data) {
  append_u16(bytes, code);
  append_u16(bytes, static_cast<std::uint16_t>(data.size()));
  bytes.insert(bytes.end(), data.begin(), data.end());
}

void set_u16(std::vector<std::byte> &bytes, std::size_t offset,
             std::uint16_t value) {
  bytes[offset] = static_cast<std::byte>(value >> 8U);
  bytes[offset + 1] = static_cast<std::byte>(value & 0xffU);
}

std::vector<std::byte> ipv6_udp_packet(std::span<const std::byte> payload,
                                       std::uint16_t source_port = 546,
                                       std::uint16_t destination_port = 547) {
  const auto udp_length = static_cast<std::uint16_t>(8 + payload.size());
  std::vector<std::byte> bytes(14 + 40 + udp_length, std::byte{0});
  bytes[12] = std::byte{0x86};
  bytes[13] = std::byte{0xdd};
  bytes[14] = std::byte{0x60};
  set_u16(bytes, 18, udp_length);
  bytes[20] = std::byte{17};
  bytes[21] = std::byte{64};
  bytes[22] = std::byte{0x20};
  bytes[23] = std::byte{0x01};
  bytes[38] = std::byte{0xff};
  bytes[39] = std::byte{0x02};
  set_u16(bytes, 54, source_port);
  set_u16(bytes, 56, destination_port);
  set_u16(bytes, 58, udp_length);
  std::copy(payload.begin(), payload.end(), bytes.begin() + 62);
  return bytes;
}

std::vector<std::byte> client_message(std::uint8_t type = 7) {
  return {static_cast<std::byte>(type), std::byte{0x12}, std::byte{0x34},
          std::byte{0x56}};
}

void identity_associations_and_common_options_are_structured() {
  const auto registry = core_registry();
  PacketParser parser(registry);
  auto message = client_message();

  std::vector<std::byte> duid;
  append_u16(duid, 1);
  append_u16(duid, 1);
  append_u32(duid, 0x01020304);
  duid.insert(duid.end(), {std::byte{0}, std::byte{1}, std::byte{2},
                           std::byte{3}, std::byte{4}, std::byte{5}});
  append_option(message, 1, duid);

  std::vector<std::byte> ia_address(16, std::byte{0});
  ia_address[0] = std::byte{0x20};
  ia_address[1] = std::byte{0x01};
  append_u32(ia_address, 1800);
  append_u32(ia_address, 3600);
  std::vector<std::byte> ia_na;
  append_u32(ia_na, 0xabcdef01);
  append_u32(ia_na, 900);
  append_u32(ia_na, 1800);
  append_option(ia_na, 5, ia_address);
  append_option(message, 3, ia_na);

  std::vector<std::byte> dns(16, std::byte{0});
  dns[0] = std::byte{0x20};
  dns[1] = std::byte{0x01};
  dns[15] = std::byte{0x53};
  append_option(message, 23, dns);
  const std::vector<std::byte> empty;
  append_option(message, 14, empty);

  const auto packet = ipv6_udp_packet(message);
  const auto tree =
      parser.parse(pruftnet::tests::raw_packet_view(packet, packet.size()));
  assert(tree.condition() == ParseCondition::Complete);
  assert(node_count(tree, *registry, "dhcpv6.message") == 1);
  assert(node(tree, *registry, "dhcpv6.transaction_id").value_low == 0x123456);
  assert(node(tree, *registry, "dhcpv6.duid.type").value_low == 1);
  assert(node(tree, *registry, "dhcpv6.iaid").value_low == 0xabcdef01);
  assert(node(tree, *registry, "dhcpv6.preferred_lifetime").value_low == 1800);
  assert(node(tree, *registry, "dhcpv6.valid_lifetime").value_low == 3600);
  assert(node(tree, *registry, "dhcpv6.dns_server").length == 16);
  assert(node(tree, *registry, "dhcpv6.rapid_commit").value_low == 1);
}

void relay_messages_are_bounded_and_nested() {
  const auto registry = core_registry();
  PacketParser parser(registry);
  const auto inner = client_message(1);
  std::vector<std::byte> relay(34, std::byte{0});
  relay[0] = std::byte{12};
  relay[1] = std::byte{1};
  relay[2] = std::byte{0x20};
  relay[3] = std::byte{0x01};
  relay[18] = std::byte{0xfe};
  relay[19] = std::byte{0x80};
  append_option(relay, 9, inner);
  const std::vector<std::byte> interface_id{std::byte{1}, std::byte{2},
                                            std::byte{3}};
  append_option(relay, 18, interface_id);

  const auto packet = ipv6_udp_packet(relay, 547, 547);
  const auto tree =
      parser.parse(pruftnet::tests::raw_packet_view(packet, packet.size()));
  assert(tree.condition() == ParseCondition::Complete);
  assert(node_count(tree, *registry, "dhcpv6.message") == 2);
  assert(node_count(tree, *registry, "dhcpv6.relay_message") == 1);
  assert(node(tree, *registry, "dhcpv6.hop_count").value_low == 1);
  assert(node(tree, *registry, "dhcpv6.interface_id").length == 3);
}

void invalid_lifetimes_and_capture_truncation_are_distinct() {
  const auto registry = core_registry();
  PacketParser parser(registry);

  auto invalid = client_message();
  std::vector<std::byte> address(16, std::byte{0});
  append_u32(address, 200);
  append_u32(address, 100);
  append_option(invalid, 5, address);
  const auto invalid_packet = ipv6_udp_packet(invalid);
  const auto invalid_tree = parser.parse(
      pruftnet::tests::raw_packet_view(invalid_packet, invalid_packet.size()));
  assert(invalid_tree.condition() == ParseCondition::Malformed);

  auto complete_message = client_message();
  std::vector<std::byte> status;
  append_u16(status, 0);
  status.push_back(std::byte{'o'});
  status.push_back(std::byte{'k'});
  append_option(complete_message, 13, status);
  const auto complete = ipv6_udp_packet(complete_message);
  auto truncated = complete;
  truncated.resize(truncated.size() - 1);
  const auto truncated_tree = parser.parse(pruftnet::tests::raw_packet_view(
      truncated, static_cast<std::uint32_t>(complete.size())));
  assert(truncated_tree.condition() == ParseCondition::Partial);
}

} // namespace

int main() {
  identity_associations_and_common_options_are_structured();
  relay_messages_are_bounded_and_nested();
  invalid_lifetimes_and_capture_truncation_are_distinct();
}

#include <algorithm>
#include <bit>
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

void set_u64(std::vector<std::byte> &bytes, std::size_t offset,
             std::uint64_t value) {
  for (std::size_t index = 0; index < 8; ++index) {
    bytes[offset + index] = static_cast<std::byte>(value >> ((7 - index) * 8U));
  }
}

std::vector<std::byte> udp_packet(std::span<const std::byte> payload) {
  auto packet = pruftnet::tests::ethernet_ipv4_udp_packet(payload);
  set_u16(packet, 34, 50000);
  set_u16(packet, 36, 123);
  return packet;
}

void standard_headers_extensions_and_authentication_are_structured() {
  const auto registry = core_registry();
  PacketParser parser(registry);
  std::vector<std::byte> message(48, std::byte{0});
  message[0] = std::byte{0x23};
  message[1] = std::byte{2};
  message[2] = std::byte{6};
  message[3] = std::byte{0xfa};
  set_u32(message, 4, 0x00010000);
  set_u32(message, 8, 0x00008000);
  message[12] = std::byte{192};
  message[13] = std::byte{0};
  message[14] = std::byte{2};
  message[15] = std::byte{1};
  set_u64(message, 16, 0x0102030405060708ULL);
  set_u64(message, 40, 0x1112131415161718ULL);

  const auto extension_offset = message.size();
  message.resize(message.size() + 16, std::byte{0xaa});
  set_u16(message, extension_offset, 0x0104);
  set_u16(message, extension_offset + 2, 16);
  const auto auth_offset = message.size();
  message.resize(message.size() + 20, std::byte{0xbb});
  set_u32(message, auth_offset, 0x12345678);

  const auto packet = udp_packet(message);
  const auto tree =
      parser.parse(pruftnet::tests::raw_packet_view(packet, packet.size()));
  assert(tree.condition() == ParseCondition::Complete);
  assert(node(tree, *registry, "ntp.version").value_low == 4);
  assert(node(tree, *registry, "ntp.mode").value_low == 3);
  assert(std::bit_cast<std::int64_t>(
             node(tree, *registry, "ntp.precision").value_low) == -6);
  assert(node(tree, *registry, "ntp.transmit_timestamp").value_low ==
         0x1112131415161718ULL);
  assert(node_count(tree, *registry, "ntp.extension") == 1);
  assert(node(tree, *registry, "ntp.extension.type").value_low == 0x0104);
  assert(node(tree, *registry, "ntp.key_id").value_low == 0x12345678);
  assert(node(tree, *registry, "ntp.digest").length == 16);
}

void control_and_private_modes_are_parsed_separately() {
  const auto registry = core_registry();
  PacketParser parser(registry);

  std::vector<std::byte> control(16, std::byte{0});
  control[0] = std::byte{0x26};
  control[1] = std::byte{0xa2};
  set_u16(control, 2, 7);
  set_u16(control, 4, 0x1234);
  set_u16(control, 6, 9);
  set_u16(control, 8, 4);
  set_u16(control, 10, 3);
  control[12] = std::byte{'a'};
  control[13] = std::byte{'b'};
  control[14] = std::byte{'c'};
  const auto control_packet = udp_packet(control);
  const auto control_tree = parser.parse(
      pruftnet::tests::raw_packet_view(control_packet, control_packet.size()));
  assert(control_tree.condition() == ParseCondition::Complete);
  assert(node(control_tree, *registry, "ntp.control.response").value_low == 1);
  assert(node(control_tree, *registry, "ntp.control.more").value_low == 1);
  assert(node(control_tree, *registry, "ntp.control.opcode").value_low == 2);
  assert(node(control_tree, *registry, "ntp.control.data").length == 3);

  std::vector<std::byte> private_message(16, std::byte{0});
  private_message[0] = std::byte{0xa7};
  private_message[1] = std::byte{0x85};
  private_message[2] = std::byte{3};
  private_message[3] = std::byte{2};
  set_u16(private_message, 4, 0x1002);
  set_u16(private_message, 6, 4);
  const auto private_packet = udp_packet(private_message);
  const auto private_tree = parser.parse(
      pruftnet::tests::raw_packet_view(private_packet, private_packet.size()));
  assert(private_tree.condition() == ParseCondition::Complete);
  assert(node(private_tree, *registry, "ntp.private.response").value_low == 1);
  assert(node(private_tree, *registry, "ntp.private.authenticated").value_low ==
         1);
  assert(node(private_tree, *registry, "ntp.private.sequence").value_low == 5);
  assert(node(private_tree, *registry, "ntp.private.error_code").value_low ==
         1);
  assert(node(private_tree, *registry, "ntp.private.item_count").value_low ==
         2);
  assert(node(private_tree, *registry, "ntp.private.data").length == 8);
}

void invalid_lengths_and_capture_truncation_are_distinct() {
  const auto registry = core_registry();
  PacketParser parser(registry);

  const std::vector<std::byte> short_standard{std::byte{0x23}, std::byte{1}};
  const auto short_packet = udp_packet(short_standard);
  assert(parser
             .parse(pruftnet::tests::raw_packet_view(short_packet,
                                                     short_packet.size()))
             .condition() == ParseCondition::Malformed);

  std::vector<std::byte> complete(48, std::byte{0});
  complete[0] = std::byte{0x24};
  const auto complete_packet = udp_packet(complete);
  auto truncated = complete_packet;
  truncated.resize(truncated.size() - 5);
  const auto truncated_tree = parser.parse(pruftnet::tests::raw_packet_view(
      truncated, static_cast<std::uint32_t>(complete_packet.size())));
  assert(truncated_tree.condition() == ParseCondition::Partial);
}

} // namespace

int main() {
  standard_headers_extensions_and_authentication_are_structured();
  control_and_private_modes_are_parsed_separately();
  invalid_lengths_and_capture_truncation_are_distinct();
}

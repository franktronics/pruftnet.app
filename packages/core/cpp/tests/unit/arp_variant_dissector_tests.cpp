#include <cassert>
#include <cstddef>
#include <cstdint>
#include <memory>
#include <utility>
#include <variant>
#include <vector>

#include "parsing/packet_parser.hpp"
#include "pruftnet/parsing/registry.hpp"
#include "pruftnet/parsing/summary_extractor.hpp"
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

std::vector<std::byte> ethernet_frame(std::uint16_t type,
                                      std::vector<std::byte> payload) {
  std::vector<std::byte> frame(14, std::byte{0});
  set_u16(frame, 12, type);
  frame.insert(frame.end(), payload.begin(), payload.end());
  return frame;
}

void rarp_uses_its_dedicated_ethertype_and_protocol_node() {
  const auto registry = core_registry();
  PacketParser parser(registry);
  SummaryExtractor summaries(*registry);

  std::vector<std::byte> rarp(28, std::byte{0});
  set_u16(rarp, 0, 1);
  set_u16(rarp, 2, 0x0800);
  rarp[4] = std::byte{6};
  rarp[5] = std::byte{4};
  set_u16(rarp, 6, 3);
  for (std::size_t index = 0; index < 6; ++index) {
    rarp[8 + index] = static_cast<std::byte>(0x10U + index);
    rarp[18 + index] = static_cast<std::byte>(0xa0U + index);
  }
  const auto frame = ethernet_frame(0x8035, std::move(rarp));
  const auto raw = pruftnet::tests::raw_packet_view(frame, frame.size());
  const auto tree = parser.parse(raw);
  assert(tree.condition() == ParseCondition::Complete);
  assert(node_count(tree, *registry, "rarp.packet") == 1);
  assert(node_count(tree, *registry, "arp.packet") == 0);
  assert(node(tree, *registry, "arp.operation").value_low == 3);
  const auto summary = summaries.extract(raw, tree);
  assert(summary.protocol == "RARP");
}

void inarp_is_selected_by_operation_without_changing_the_arp_format() {
  const auto registry = core_registry();
  PacketParser parser(registry);
  SummaryExtractor summaries(*registry);

  std::vector<std::byte> inarp(20, std::byte{0});
  set_u16(inarp, 0, 15);
  set_u16(inarp, 2, 0x0800);
  inarp[4] = std::byte{2};
  inarp[5] = std::byte{4};
  set_u16(inarp, 6, 8);
  inarp[8] = std::byte{0x10};
  inarp[9] = std::byte{0x61};
  inarp[10] = std::byte{192};
  inarp[11] = std::byte{0};
  inarp[12] = std::byte{2};
  inarp[13] = std::byte{1};
  inarp[14] = std::byte{0x0c};
  inarp[15] = std::byte{0x21};
  const auto frame = ethernet_frame(0x0806, std::move(inarp));
  const auto raw = pruftnet::tests::raw_packet_view(frame, frame.size());
  const auto tree = parser.parse(raw);
  assert(tree.condition() == ParseCondition::Complete);
  assert(node_count(tree, *registry, "inarp.packet") == 1);
  assert(node_count(tree, *registry, "arp.packet") == 0);
  assert(node(tree, *registry, "arp.hardware_type").value_low == 15);
  assert(node(tree, *registry, "arp.operation").value_low == 8);
  const auto summary = summaries.extract(raw, tree);
  assert(summary.protocol == "InARP");
}

void ordinary_arp_keeps_its_existing_protocol_identity() {
  const auto registry = core_registry();
  PacketParser parser(registry);
  std::vector<std::byte> arp(28, std::byte{0});
  set_u16(arp, 0, 1);
  set_u16(arp, 2, 0x0800);
  arp[4] = std::byte{6};
  arp[5] = std::byte{4};
  set_u16(arp, 6, 1);
  const auto frame = ethernet_frame(0x0806, std::move(arp));
  const auto tree =
      parser.parse(pruftnet::tests::raw_packet_view(frame, frame.size()));
  assert(tree.condition() == ParseCondition::Complete);
  assert(node_count(tree, *registry, "arp.packet") == 1);
  assert(node_count(tree, *registry, "rarp.packet") == 0);
  assert(node_count(tree, *registry, "inarp.packet") == 0);
}

} // namespace

int main() {
  rarp_uses_its_dedicated_ethertype_and_protocol_node();
  inarp_is_selected_by_operation_without_changing_the_arp_format();
  ordinary_arp_keeps_its_existing_protocol_identity();
}

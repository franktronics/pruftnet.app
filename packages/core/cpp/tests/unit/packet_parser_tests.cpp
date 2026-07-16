#include <algorithm>
#include <array>
#include <cassert>
#include <cstddef>
#include <functional>
#include <memory>
#include <span>
#include <stdexcept>
#include <string_view>
#include <variant>
#include <vector>

#include "parsing/packet_parser.hpp"
#include "pruftnet/parsing/registry.hpp"
#include "tests/support/ethernet_ipv4_udp_fixture.hpp"
#include "tests/support/parsed_tree_test_support.hpp"

namespace {

using namespace pruftnet::parsing;
using pruftnet::parsing::internal::PacketParser;
using pruftnet::tests::field_id;
using pruftnet::tests::node;
using pruftnet::tests::node_count;

RegistrySnapshotPtr core_registry() {
  auto result = make_core_registry();
  assert(std::holds_alternative<RegistrySnapshot>(result));
  return std::make_shared<const RegistrySnapshot>(
      std::move(std::get<RegistrySnapshot>(result)));
}

void valid_udp_packet_builds_exact_protocol_path() {
  constexpr std::array payload{std::byte{'h'}, std::byte{'e'}, std::byte{'l'},
                               std::byte{'l'}, std::byte{'o'}};
  const auto bytes = pruftnet::tests::ethernet_ipv4_udp_packet(payload);
  const auto registry = core_registry();
  PacketParser parser(registry);
  const auto tree =
      parser.parse(pruftnet::tests::raw_packet_view(bytes, bytes.size()));

  assert(tree.condition() == ParseCondition::Complete);
  assert(tree.registry_revision() == registry->revision());
  assert(tree.data_sources().size() == 1);
  assert(tree.source_bytes(tree.data_sources().front()).size() == bytes.size());
  assert(tree.value_arena().empty());
  assert(node(tree, *registry, "root.frame").parent_index == kNoParentIndex);
  assert(node(tree, *registry, "eth.frame").parent_index == 0);
  assert(node(tree, *registry, "eth.type").value_low == 0x0800);
  assert(node(tree, *registry, "ipv4.version").value_low == 4);
  assert(node(tree, *registry, "ipv4.header_length").value_low == 20);
  assert(node(tree, *registry, "ipv4.total_length").value_low == 33);
  assert(node(tree, *registry, "ipv4.protocol").value_low == 17);
  assert(node(tree, *registry, "udp.source_port").value_low == 40'001);
  assert(node(tree, *registry, "udp.destination_port").value_low == 5'001);
  assert(node(tree, *registry, "udp.length").value_low == 13);
  const auto parsed_payload =
      tree.node_bytes(node(tree, *registry, "udp.payload"));
  assert(std::equal(parsed_payload.begin(), parsed_payload.end(),
                    payload.begin(), payload.end()));
}

void every_capture_boundary_is_safe_and_partial() {
  const auto bytes = pruftnet::tests::ethernet_ipv4_udp_packet();
  const auto registry = core_registry();
  PacketParser parser(registry);
  for (std::size_t captured = 0; captured < bytes.size(); ++captured) {
    const auto span = std::span<const std::byte>(bytes.data(), captured);
    const auto tree = parser.parse(pruftnet::tests::raw_packet_view(
        span, bytes.size(), 1, pruftnet::sniffing::PacketFlagTruncated));
    assert(tree.condition() == ParseCondition::Partial);
    assert(!tree.nodes().empty());
  }
}

void malformed_protocol_lengths_stop_descent() {
  const auto registry = core_registry();
  PacketParser parser(registry);

  auto invalid_version = pruftnet::tests::ethernet_ipv4_udp_packet();
  invalid_version[14] = std::byte{0x65};
  assert(parser
             .parse(pruftnet::tests::raw_packet_view(invalid_version,
                                                     invalid_version.size()))
             .condition() == ParseCondition::Malformed);

  auto invalid_ihl = pruftnet::tests::ethernet_ipv4_udp_packet();
  invalid_ihl[14] = std::byte{0x44};
  assert(parser
             .parse(pruftnet::tests::raw_packet_view(invalid_ihl,
                                                     invalid_ihl.size()))
             .condition() == ParseCondition::Malformed);

  auto invalid_udp_length = pruftnet::tests::ethernet_ipv4_udp_packet();
  invalid_udp_length[38] = std::byte{0};
  invalid_udp_length[39] = std::byte{7};
  assert(parser
             .parse(pruftnet::tests::raw_packet_view(invalid_udp_length,
                                                     invalid_udp_length.size()))
             .condition() == ParseCondition::Malformed);

  auto invalid_total_length = pruftnet::tests::ethernet_ipv4_udp_packet();
  invalid_total_length[16] = std::byte{0};
  invalid_total_length[17] = std::byte{19};
  const auto invalid_total_tree = parser.parse(pruftnet::tests::raw_packet_view(
      invalid_total_length, invalid_total_length.size()));
  assert(invalid_total_tree.condition() == ParseCondition::Malformed);
  const auto &ip_node = node(invalid_total_tree, *registry, "ipv4.packet");
  assert(ip_node.length >= 20);

  auto reserved_flag = pruftnet::tests::ethernet_ipv4_udp_packet();
  reserved_flag[20] = std::byte{0x80};
  const auto reserved_tree = parser.parse(
      pruftnet::tests::raw_packet_view(reserved_flag, reserved_flag.size()));
  assert(reserved_tree.condition() == ParseCondition::Malformed);
  assert(node_count(reserved_tree, *registry, "udp.datagram") == 0);
}

void unsupported_and_fragmented_payloads_remain_visible() {
  const auto registry = core_registry();
  PacketParser parser(registry);

  auto unknown = pruftnet::tests::ethernet_ipv4_udp_packet();
  unknown[12] = std::byte{0x88};
  unknown[13] = std::byte{0xb5};
  const auto unknown_tree =
      parser.parse(pruftnet::tests::raw_packet_view(unknown, unknown.size()));
  assert(unknown_tree.condition() == ParseCondition::Complete);
  assert(node(unknown_tree, *registry, "unknown.data").length ==
         unknown.size() - 14);

  const auto unsupported_tree = parser.parse(
      pruftnet::tests::raw_packet_view(unknown, unknown.size(), 147));
  assert(unsupported_tree.condition() == ParseCondition::Complete);
  assert(node(unsupported_tree, *registry, "unknown.data").length ==
         unknown.size());

  auto fragmented = pruftnet::tests::ethernet_ipv4_udp_packet();
  fragmented[20] = std::byte{0x20};
  const auto fragmented_tree = parser.parse(
      pruftnet::tests::raw_packet_view(fragmented, fragmented.size()));
  assert(fragmented_tree.condition() == ParseCondition::Complete);
  assert(node(fragmented_tree, *registry, "unknown.data").length == 8);
  const auto udp_id = field_id(*registry, "udp.datagram");
  for (const auto &candidate : fragmented_tree.nodes()) {
    assert(candidate.field_id != udp_id);
  }

  auto ieee_802_3 = pruftnet::tests::ethernet_ipv4_udp_packet();
  ieee_802_3[12] = std::byte{0};
  ieee_802_3[13] = std::byte{8};
  const auto ieee_tree = parser.parse(
      pruftnet::tests::raw_packet_view(ieee_802_3, ieee_802_3.size()));
  assert(ieee_tree.condition() == ParseCondition::Complete);
  assert(node_count(ieee_tree, *registry, "llc.packet") == 1);
  assert(node_count(ieee_tree, *registry, "unknown.data") == 1);
  assert(node(ieee_tree, *registry, "eth.trailer").length ==
         ieee_802_3.size() - 14 - 8);
}

void ipv4_padding_and_resource_limits_preserve_bounded_prefixes() {
  const auto registry = core_registry();
  auto bytes = pruftnet::tests::ethernet_ipv4_udp_packet();
  bytes.insert(bytes.end(), 18, std::byte{0});
  PacketParser parser(registry);
  const auto padded =
      parser.parse(pruftnet::tests::raw_packet_view(bytes, bytes.size()));
  assert(padded.condition() == ParseCondition::Complete);
  assert(node(padded, *registry, "eth.trailer").length == 18);

  ParseBudget node_budget;
  node_budget.max_nodes = 1;
  PacketParser node_limited(registry, node_budget);
  const auto node_limited_tree =
      node_limited.parse(pruftnet::tests::raw_packet_view(bytes, bytes.size()));
  assert(node_limited_tree.condition() == ParseCondition::ResourceLimit);
  assert(node_limited_tree.nodes().size() == 1);

  ParseBudget source_budget;
  source_budget.max_source_bytes = 16;
  PacketParser source_limited(registry, source_budget);
  const auto source_limited_tree = source_limited.parse(
      pruftnet::tests::raw_packet_view(bytes, bytes.size()));
  assert(source_limited_tree.condition() == ParseCondition::ResourceLimit);
  assert(source_limited_tree
             .source_bytes(source_limited_tree.data_sources().front())
             .size() == 16);

  ParseBudget value_budget;
  value_budget.max_value_bytes = 0;
  PacketParser zero_value_arena(registry, value_budget);
  const auto zero_value_tree = zero_value_arena.parse(
      pruftnet::tests::raw_packet_view(bytes, bytes.size()));
  assert(zero_value_tree.condition() == ParseCondition::Complete);
  assert(zero_value_tree.value_arena().empty());

  constexpr auto minimum_encoded =
      kParsedTreeEncodedOverhead + sizeof(ParsedDataSource) +
      std::string_view("Captured frame").size() + sizeof(ParsedFieldNode);
  ParseBudget invalid_encoded_budget;
  invalid_encoded_budget.max_encoded_bytes = minimum_encoded - 1;
  bool rejected = false;
  try {
    PacketParser invalid_budget(registry, invalid_encoded_budget);
  } catch (const std::invalid_argument &) {
    rejected = true;
  }
  assert(rejected);

  ParseBudget exact_encoded_budget;
  exact_encoded_budget.max_encoded_bytes = minimum_encoded;
  PacketParser exact_budget(registry, exact_encoded_budget);
  const auto exact_tree =
      exact_budget.parse(pruftnet::tests::raw_packet_view(bytes, bytes.size()));
  assert(exact_tree.condition() == ParseCondition::ResourceLimit);
  assert(exact_tree.source_bytes(exact_tree.data_sources().front()).empty());

  ParseBudget source_encoded_budget;
  source_encoded_budget.max_encoded_bytes = minimum_encoded + bytes.size();
  PacketParser source_encoded(registry, source_encoded_budget);
  const auto source_tree = source_encoded.parse(
      pruftnet::tests::raw_packet_view(bytes, bytes.size()));
  assert(source_tree.condition() == ParseCondition::ResourceLimit);
  assert(source_tree.source_bytes(source_tree.data_sources().front()).size() ==
         bytes.size());
}

std::vector<std::byte> vlan_udp_packet(bool nested) {
  auto bytes = pruftnet::tests::ethernet_ipv4_udp_packet();
  bytes[12] = std::byte{0x81};
  bytes[13] = std::byte{0x00};
  const std::array outer_tag{std::byte{0xa0}, std::byte{0x2a},
                             nested ? std::byte{0x88} : std::byte{0x08},
                             nested ? std::byte{0xa8} : std::byte{0x00}};
  bytes.insert(bytes.begin() + 14, outer_tag.begin(), outer_tag.end());
  if (nested) {
    const std::array inner_tag{std::byte{0x30}, std::byte{0x07},
                               std::byte{0x08}, std::byte{0x00}};
    bytes.insert(bytes.begin() + 18, inner_tag.begin(), inner_tag.end());
  }
  return bytes;
}

std::vector<std::byte> tcp_packet(std::span<const std::byte> payload = {}) {
  std::vector<std::byte> bytes(14 + 20 + 24 + payload.size(), std::byte{0});
  bytes[12] = std::byte{0x08};
  bytes[13] = std::byte{0x00};
  bytes[14] = std::byte{0x45};
  const auto ip_length = static_cast<std::uint16_t>(20 + 24 + payload.size());
  bytes[16] = static_cast<std::byte>(ip_length >> 8U);
  bytes[17] = static_cast<std::byte>(ip_length & 0xffU);
  bytes[22] = std::byte{64};
  bytes[23] = std::byte{6};
  bytes[26] = std::byte{192};
  bytes[29] = std::byte{1};
  bytes[30] = std::byte{198};
  bytes[33] = std::byte{2};
  bytes[34] = std::byte{0x30};
  bytes[35] = std::byte{0x39};
  bytes[36] = std::byte{0x01};
  bytes[37] = std::byte{0xbc};
  bytes[38] = std::byte{0x01};
  bytes[42] = std::byte{0x02};
  bytes[46] = std::byte{0x60};
  bytes[47] = std::byte{0x12};
  bytes[48] = std::byte{0x20};
  bytes[49] = std::byte{0x00};
  bytes[50] = std::byte{0xab};
  bytes[51] = std::byte{0xcd};
  bytes[54] = std::byte{1};
  bytes[55] = std::byte{1};
  bytes[56] = std::byte{0};
  bytes[57] = std::byte{0};
  std::copy(payload.begin(), payload.end(), bytes.begin() + 58);
  return bytes;
}

void vlan_dispatches_recursively_without_parent_dependencies() {
  const auto registry = core_registry();
  PacketParser parser(registry);
  const auto single = vlan_udp_packet(false);
  const auto single_tree =
      parser.parse(pruftnet::tests::raw_packet_view(single, single.size()));
  assert(single_tree.condition() == ParseCondition::Complete);
  assert(node_count(single_tree, *registry, "vlan.tag") == 1);
  assert(node(single_tree, *registry, "vlan.priority").value_low == 5);
  assert(node(single_tree, *registry, "vlan.id").value_low == 42);
  assert(node_count(single_tree, *registry, "udp.datagram") == 1);

  const auto nested = vlan_udp_packet(true);
  const auto nested_tree =
      parser.parse(pruftnet::tests::raw_packet_view(nested, nested.size()));
  assert(nested_tree.condition() == ParseCondition::Complete);
  assert(node_count(nested_tree, *registry, "vlan.tag") == 2);
  assert(node_count(nested_tree, *registry, "udp.datagram") == 1);

  ParseBudget calls;
  calls.max_dissector_calls = 3;
  PacketParser limited(registry, calls);
  const auto limited_tree =
      limited.parse(pruftnet::tests::raw_packet_view(nested, nested.size()));
  assert(limited_tree.condition() == ParseCondition::ResourceLimit);
  assert(node_count(limited_tree, *registry, "unknown.data") == 0);
}

void tcp_parses_headers_options_payload_and_boundaries() {
  constexpr std::array payload{std::byte{'d'}, std::byte{'a'}, std::byte{'t'},
                               std::byte{'a'}};
  const auto bytes = tcp_packet(payload);
  const auto registry = core_registry();
  PacketParser parser(registry);
  const auto tree =
      parser.parse(pruftnet::tests::raw_packet_view(bytes, bytes.size()));
  assert(tree.condition() == ParseCondition::Complete);
  assert(node(tree, *registry, "tcp.source_port").value_low == 12'345);
  assert(node(tree, *registry, "tcp.destination_port").value_low == 444);
  assert(node(tree, *registry, "tcp.header_length").value_low == 24);
  assert(node(tree, *registry, "tcp.flags").value_low == 0x12);
  assert(node(tree, *registry, "tcp.options").length == 4);
  const auto parsed_payload =
      tree.node_bytes(node(tree, *registry, "tcp.payload"));
  assert(std::equal(parsed_payload.begin(), parsed_payload.end(),
                    payload.begin(), payload.end()));

  auto ns = bytes;
  ns[46] = std::byte{0x61};
  const auto ns_tree =
      parser.parse(pruftnet::tests::raw_packet_view(ns, ns.size()));
  assert(node(ns_tree, *registry, "tcp.flags").value_low == 0x112);
  assert(node(ns_tree, *registry, "tcp.reserved").value_low == 0);

  for (std::size_t captured = 0; captured < bytes.size(); ++captured) {
    const auto truncated = std::span<const std::byte>(bytes.data(), captured);
    assert(parser
               .parse(pruftnet::tests::raw_packet_view(
                   truncated, bytes.size(), 1,
                   pruftnet::sniffing::PacketFlagTruncated))
               .condition() == ParseCondition::Partial);
  }
  auto invalid = bytes;
  invalid[46] = std::byte{0x40};
  assert(parser.parse(pruftnet::tests::raw_packet_view(invalid, invalid.size()))
             .condition() == ParseCondition::Malformed);
}

} // namespace

int main() {
  valid_udp_packet_builds_exact_protocol_path();
  every_capture_boundary_is_safe_and_partial();
  malformed_protocol_lengths_stop_descent();
  unsupported_and_fragmented_payloads_remain_visible();
  ipv4_padding_and_resource_limits_preserve_bounded_prefixes();
  vlan_dispatches_recursively_without_parent_dependencies();
  tcp_parses_headers_options_payload_and_boundaries();
}

#include <algorithm>
#include <cassert>
#include <cstddef>
#include <cstdint>
#include <memory>
#include <span>
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
using pruftnet::tests::field_id;
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

void append_u32(std::vector<std::byte> &bytes, std::uint32_t value) {
  bytes.push_back(static_cast<std::byte>(value >> 24U));
  bytes.push_back(static_cast<std::byte>((value >> 16U) & 0xffU));
  bytes.push_back(static_cast<std::byte>((value >> 8U) & 0xffU));
  bytes.push_back(static_cast<std::byte>(value & 0xffU));
}

void append(std::vector<std::byte> &destination,
            std::span<const std::byte> source) {
  destination.insert(destination.end(), source.begin(), source.end());
}

void append_variable_integer(std::vector<std::byte> &bytes,
                             std::uint64_t value) {
  if (value <= 63) {
    bytes.push_back(static_cast<std::byte>(value));
    return;
  }
  if (value <= 16'383) {
    bytes.push_back(static_cast<std::byte>(0x40U | (value >> 8U)));
    bytes.push_back(static_cast<std::byte>(value & 0xffU));
    return;
  }
  if (value <= 1'073'741'823) {
    bytes.push_back(static_cast<std::byte>(0x80U | (value >> 24U)));
    bytes.push_back(static_cast<std::byte>((value >> 16U) & 0xffU));
    bytes.push_back(static_cast<std::byte>((value >> 8U) & 0xffU));
    bytes.push_back(static_cast<std::byte>(value & 0xffU));
    return;
  }
  bytes.push_back(static_cast<std::byte>(0xc0U | (value >> 56U)));
  for (int shift = 48; shift >= 0; shift -= 8) {
    bytes.push_back(static_cast<std::byte>((value >> shift) & 0xffU));
  }
}

std::vector<std::byte> long_common(std::uint8_t first, std::uint32_t version,
                                   std::span<const std::byte> destination,
                                   std::span<const std::byte> source) {
  std::vector<std::byte> result{static_cast<std::byte>(first)};
  append_u32(result, version);
  result.push_back(static_cast<std::byte>(destination.size()));
  append(result, destination);
  result.push_back(static_cast<std::byte>(source.size()));
  append(result, source);
  return result;
}

std::vector<std::byte>
initial_packet(std::uint8_t first, std::uint32_t version,
               std::span<const std::byte> destination,
               std::span<const std::byte> source,
               std::span<const std::byte> token,
               std::span<const std::byte> protected_payload) {
  auto result = long_common(first, version, destination, source);
  append_variable_integer(result, token.size());
  append(result, token);
  append_variable_integer(result, protected_payload.size());
  append(result, protected_payload);
  return result;
}

std::vector<std::byte>
protected_long_packet(std::uint8_t first, std::uint32_t version,
                      std::span<const std::byte> destination,
                      std::span<const std::byte> source,
                      std::span<const std::byte> protected_payload) {
  auto result = long_common(first, version, destination, source);
  append_variable_integer(result, protected_payload.size());
  append(result, protected_payload);
  return result;
}

std::vector<std::byte> udp_packet(std::span<const std::byte> payload) {
  auto packet = pruftnet::tests::ethernet_ipv4_udp_packet(payload);
  set_u16(packet, 34, 50'000);
  set_u16(packet, 36, 443);
  return packet;
}

ParsedPacketTree parse(PacketParser &parser, std::span<const std::byte> packet,
                       std::uint32_t wire_length = 0,
                       std::uint64_t packet_id = 1, std::uint32_t flags = 0) {
  return parser.parse(pruftnet::sniffing::RawPacketView{
      .metadata =
          {
              .key =
                  {
                      .capture_id = {.high = 1, .low = 2},
                      .packet_id = packet_id,
                  },
              .captured_len = static_cast<std::uint32_t>(packet.size()),
              .wire_len = wire_length == 0
                              ? static_cast<std::uint32_t>(packet.size())
                              : wire_length,
              .link_type = 1,
              .flags = flags,
          },
      .bytes = packet,
  });
}

std::vector<std::uint64_t> values(const ParsedPacketTree &tree,
                                  const RegistrySnapshot &registry,
                                  std::string_view key) {
  const auto id = field_id(registry, key);
  std::vector<std::uint64_t> result;
  for (const auto &candidate : tree.nodes()) {
    if (candidate.field_id == id) {
      result.push_back(candidate.value_low);
    }
  }
  return result;
}

void version_one_and_coalesced_packets_are_bounded_by_length_fields() {
  const auto registry = core_registry();
  PacketParser parser(registry);
  const std::vector destination{
      std::byte{0x83}, std::byte{0x94}, std::byte{0xc8}, std::byte{0xf0},
      std::byte{0x3e}, std::byte{0x51}, std::byte{0x57}, std::byte{0x08}};
  const std::vector source{std::byte{0x11}, std::byte{0x22}, std::byte{0x33},
                           std::byte{0x44}};
  const std::vector initial_payload{std::byte{0x9f}, std::byte{0x10},
                                    std::byte{0x20}, std::byte{0x30},
                                    std::byte{0x40}};
  const std::vector handshake_payload{std::byte{0xaa}, std::byte{0xbb},
                                      std::byte{0xcc}};

  auto datagram =
      initial_packet(0xc0, 1, destination, source, {}, initial_payload);
  const auto initial_length = datagram.size();
  append(datagram, protected_long_packet(0xe0, 1, destination, source,
                                         handshake_payload));
  const auto tree = parse(parser, udp_packet(datagram));

  assert(tree.condition() == ParseCondition::Complete);
  assert(node_count(tree, *registry, "quic.packet") == 2);
  assert((values(tree, *registry, "quic.packet_type") ==
          std::vector<std::uint64_t>{0, 2}));
  assert((values(tree, *registry, "quic.coalesced_index") ==
          std::vector<std::uint64_t>{0, 1}));
  const auto packet_lengths = values(tree, *registry, "quic.packet_length");
  assert(packet_lengths.size() == 2);
  assert(packet_lengths[0] == initial_length);
  assert(packet_lengths[1] == datagram.size() - initial_length);
  assert(node(tree, *registry, "quic.version").value_low == 1);
  assert(node(tree, *registry, "quic.destination_connection_id_length")
             .value_low == destination.size());
  assert(node(tree, *registry, "quic.token_length").value_low == 0);
  assert(node(tree, *registry, "quic.length").value_low ==
         initial_payload.size());
}

void version_two_mapping_retry_and_variable_integers_are_explicit() {
  const auto registry = core_registry();
  PacketParser parser(registry);
  const std::vector destination(8, std::byte{0x42});
  const std::vector source(8, std::byte{0x24});
  const std::vector token(64, std::byte{0x55});
  const std::vector protected_payload{std::byte{1}, std::byte{2}, std::byte{3}};
  const auto initial = initial_packet(0xd0, 0x6b3343cf, destination, source,
                                      token, protected_payload);
  const auto initial_tree = parse(parser, udp_packet(initial));

  assert(initial_tree.condition() == ParseCondition::Complete);
  assert(node(initial_tree, *registry, "quic.packet_type").value_low == 0);
  assert(
      node(initial_tree, *registry, "quic.long_packet_type_bits").value_low ==
      1);
  assert(node(initial_tree, *registry, "quic.token_length").value_low == 64);
  assert(node(initial_tree, *registry, "quic.token_length").length == 2);
  assert(initial_tree.node_bytes(node(initial_tree, *registry, "quic.token"))
             .size() == 64);

  PacketParser retry_parser(registry);
  auto retry = long_common(0xc0, 0x6b3343cf, destination, source);
  const std::vector retry_token{std::byte{'t'}, std::byte{'o'}, std::byte{'k'},
                                std::byte{'e'}, std::byte{'n'}};
  append(retry, retry_token);
  retry.insert(retry.end(), 16, std::byte{0xa5});
  const auto retry_tree = parse(retry_parser, udp_packet(retry));
  assert(retry_tree.condition() == ParseCondition::Complete);
  assert(node(retry_tree, *registry, "quic.packet_type").value_low == 3);
  const auto parsed_retry_token =
      retry_tree.node_bytes(node(retry_tree, *registry, "quic.retry_token"));
  assert(parsed_retry_token.size() == retry_token.size());
  assert(std::equal(parsed_retry_token.begin(), parsed_retry_token.end(),
                    retry_token.begin()));
  assert(
      retry_tree
          .node_bytes(node(retry_tree, *registry, "quic.retry_integrity_tag"))
          .size() == 16);
}

void version_negotiation_unknown_versions_and_short_headers_are_visible() {
  const auto registry = core_registry();
  const std::vector destination{std::byte{1}, std::byte{2}, std::byte{3},
                                std::byte{4}};
  const std::vector source{std::byte{5}, std::byte{6}};

  PacketParser negotiation_parser(registry);
  auto negotiation = long_common(0x80, 0, destination, source);
  append_u32(negotiation, 1);
  append_u32(negotiation, 0x6b3343cf);
  const auto negotiation_tree =
      parse(negotiation_parser, udp_packet(negotiation));
  assert(negotiation_tree.condition() == ParseCondition::Complete);
  assert(node(negotiation_tree, *registry, "quic.packet_type").value_low == 4);
  assert((values(negotiation_tree, *registry, "quic.supported_version") ==
          std::vector<std::uint64_t>{1, 0x6b3343cf}));

  PacketParser unknown_parser(registry);
  auto unknown = long_common(0xc0, 0x11223344, destination, source);
  const std::vector version_data{std::byte{7}, std::byte{8}, std::byte{9}};
  append(unknown, version_data);
  const auto unknown_tree = parse(unknown_parser, udp_packet(unknown));
  assert(unknown_tree.condition() == ParseCondition::Complete);
  assert(node(unknown_tree, *registry, "quic.packet_type").value_low == 6);
  assert(unknown_tree
             .node_bytes(
                 node(unknown_tree, *registry, "quic.version_specific_data"))
             .size() == version_data.size());

  PacketParser short_parser(registry);
  const std::vector short_packet{std::byte{0x6d}, std::byte{1}, std::byte{2},
                                 std::byte{3}};
  const auto short_tree = parse(short_parser, udp_packet(short_packet));
  assert(short_tree.condition() == ParseCondition::Complete);
  assert(node(short_tree, *registry, "quic.packet_type").value_low == 5);
  assert(node(short_tree, *registry, "quic.header_form").value_low == 0);
  assert(node(short_tree, *registry, "quic.fixed_bit").value_low == 1);
  assert(node(short_tree, *registry, "quic.spin_bit").value_low == 1);
  assert(node(short_tree, *registry, "quic.short_protected_bits").value_low ==
         0x0d);
}

void invalid_lengths_and_all_capture_boundaries_are_safe() {
  const auto registry = core_registry();
  const std::vector destination(8, std::byte{0x42});
  const std::vector source(4, std::byte{0x24});
  const std::vector protected_payload{std::byte{1}, std::byte{2}, std::byte{3},
                                      std::byte{4}};
  const auto valid = udp_packet(
      initial_packet(0xc0, 1, destination, source, {}, protected_payload));

  PacketParser boundary_parser(registry);
  for (std::size_t captured = 0; captured < valid.size(); ++captured) {
    const auto truncated = std::span<const std::byte>(valid).first(captured);
    const auto tree = parse(
        boundary_parser, truncated, static_cast<std::uint32_t>(valid.size()),
        captured + 1, pruftnet::sniffing::PacketFlagTruncated);
    assert(tree.condition() == ParseCondition::Partial);
  }

  PacketParser cid_parser(registry);
  auto excessive_cid = long_common(0xc0, 1, {}, {});
  excessive_cid[5] = std::byte{21};
  excessive_cid.insert(excessive_cid.begin() + 6, 21, std::byte{0});
  assert(parse(cid_parser, udp_packet(excessive_cid)).condition() ==
         ParseCondition::Malformed);

  PacketParser negotiation_parser(registry);
  auto invalid_negotiation = long_common(0x80, 0, {}, {});
  invalid_negotiation.push_back(std::byte{1});
  assert(
      parse(negotiation_parser, udp_packet(invalid_negotiation)).condition() ==
      ParseCondition::Malformed);

  PacketParser retry_parser(registry);
  auto empty_retry = long_common(0xf0, 1, destination, source);
  empty_retry.insert(empty_retry.end(), 16, std::byte{0});
  assert(parse(retry_parser, udp_packet(empty_retry)).condition() ==
         ParseCondition::Malformed);

  PacketParser length_parser(registry);
  auto excessive_length = long_common(0xe0, 1, destination, source);
  append_variable_integer(excessive_length, 32);
  excessive_length.push_back(std::byte{0});
  assert(parse(length_parser, udp_packet(excessive_length)).condition() ==
         ParseCondition::Malformed);
}

} // namespace

int main() {
  version_one_and_coalesced_packets_are_bounded_by_length_fields();
  version_two_mapping_retry_and_variable_integers_are_explicit();
  version_negotiation_unknown_versions_and_short_headers_are_visible();
  invalid_lengths_and_all_capture_boundaries_are_safe();
}

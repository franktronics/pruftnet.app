#include <algorithm>
#include <array>
#include <cassert>
#include <cstddef>
#include <cstdint>
#include <memory>
#include <span>
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
using pruftnet::tests::node;
using pruftnet::tests::node_count;

RegistrySnapshotPtr core_registry() {
  auto result = make_core_registry();
  assert(std::holds_alternative<RegistrySnapshot>(result));
  return std::make_shared<const RegistrySnapshot>(
      std::move(std::get<RegistrySnapshot>(result)));
}

std::vector<std::byte> ethernet_packet(std::uint16_t type_or_length,
                                       std::span<const std::byte> payload) {
  std::vector<std::byte> bytes(14, std::byte{0});
  bytes[12] = static_cast<std::byte>(type_or_length >> 8U);
  bytes[13] = static_cast<std::byte>(type_or_length);
  bytes.insert(bytes.end(), payload.begin(), payload.end());
  return bytes;
}

void append_tlv(std::vector<std::byte> &bytes, std::uint8_t type,
                std::span<const std::byte> value) {
  const auto header = static_cast<std::uint16_t>(
      (static_cast<std::uint16_t>(type) << 9U) | value.size());
  bytes.push_back(static_cast<std::byte>(header >> 8U));
  bytes.push_back(static_cast<std::byte>(header));
  bytes.insert(bytes.end(), value.begin(), value.end());
}

std::vector<std::byte> text_bytes(std::string_view text) {
  std::vector<std::byte> bytes;
  bytes.reserve(text.size());
  for (const char character : text) {
    bytes.push_back(
        static_cast<std::byte>(static_cast<unsigned char>(character)));
  }
  return bytes;
}

std::vector<std::byte> valid_lldp(bool include_end = true) {
  std::vector<std::byte> bytes;
  const std::array chassis{
      std::byte{4},    std::byte{0x00}, std::byte{0x11}, std::byte{0x22},
      std::byte{0x33}, std::byte{0x44}, std::byte{0x55},
  };
  append_tlv(bytes, 1, chassis);
  auto port = text_bytes("eth0");
  port.insert(port.begin(), std::byte{5});
  append_tlv(bytes, 2, port);
  const std::array ttl{std::byte{0}, std::byte{120}};
  append_tlv(bytes, 3, ttl);
  const auto system_name = text_bytes("switch");
  append_tlv(bytes, 5, system_name);
  const std::array capabilities{
      std::byte{0x00},
      std::byte{0x14},
      std::byte{0x00},
      std::byte{0x04},
  };
  append_tlv(bytes, 7, capabilities);
  const std::array management{
      std::byte{5}, std::byte{1}, std::byte{192}, std::byte{0},
      std::byte{2}, std::byte{1}, std::byte{2},   std::byte{0},
      std::byte{0}, std::byte{0}, std::byte{7},   std::byte{0},
  };
  append_tlv(bytes, 8, management);
  const std::array organization{
      std::byte{0x00}, std::byte{0x80}, std::byte{0xc2},
      std::byte{1},    std::byte{0x12}, std::byte{0x34},
  };
  append_tlv(bytes, 127, organization);
  if (include_end) {
    append_tlv(bytes, 0, std::span<const std::byte>{});
  }
  return bytes;
}

std::vector<std::byte> bpdu(std::uint8_t version, std::uint8_t type,
                            std::size_t length) {
  std::vector<std::byte> bytes(length, std::byte{0});
  bytes[2] = static_cast<std::byte>(version);
  bytes[3] = static_cast<std::byte>(type);
  if (length < 35) {
    return bytes;
  }
  bytes[4] = std::byte{0x7f};
  bytes[5] = std::byte{0x81};
  bytes[6] = std::byte{0x23};
  bytes[7] = std::byte{0x00};
  bytes[8] = std::byte{0x11};
  bytes[9] = std::byte{0x22};
  bytes[10] = std::byte{0x33};
  bytes[11] = std::byte{0x44};
  bytes[12] = std::byte{0x55};
  bytes[16] = std::byte{10};
  bytes[17] = std::byte{0x92};
  bytes[18] = std::byte{0x34};
  bytes[19] = std::byte{0x66};
  bytes[20] = std::byte{0x77};
  bytes[21] = std::byte{0x88};
  bytes[22] = std::byte{0x99};
  bytes[23] = std::byte{0xaa};
  bytes[24] = std::byte{0xbb};
  bytes[25] = std::byte{0x80};
  bytes[26] = std::byte{1};
  bytes[28] = std::byte{1};
  bytes[29] = std::byte{0x14};
  bytes[31] = std::byte{2};
  bytes[33] = std::byte{0x0f};
  return bytes;
}

std::vector<std::byte> llc_bpdu(std::span<const std::byte> payload) {
  std::vector<std::byte> bytes{
      std::byte{0x42},
      std::byte{0x42},
      std::byte{0x03},
  };
  bytes.insert(bytes.end(), payload.begin(), payload.end());
  return ethernet_packet(static_cast<std::uint16_t>(bytes.size()), bytes);
}

std::vector<std::byte> snap_bpdu(std::span<const std::byte> payload) {
  std::vector<std::byte> bytes{
      std::byte{0xaa}, std::byte{0xaa}, std::byte{0x03}, std::byte{0x00},
      std::byte{0x80}, std::byte{0xc2}, std::byte{0x00}, std::byte{0x0e},
  };
  bytes.insert(bytes.end(), payload.begin(), payload.end());
  return ethernet_packet(static_cast<std::uint16_t>(bytes.size()), bytes);
}

void lldp_parses_mandatory_and_common_optional_tlvs() {
  const auto registry = core_registry();
  PacketParser parser(registry);
  auto payload = valid_lldp();
  auto bytes = ethernet_packet(0x88cc, payload);
  bytes.insert(bytes.end(), 7, std::byte{0});
  const auto tree =
      parser.parse(pruftnet::tests::raw_packet_view(bytes, bytes.size()));
  assert(tree.condition() == ParseCondition::Complete);
  assert(node_count(tree, *registry, "lldp.tlv") == 8);
  assert(node(tree, *registry, "lldp.chassis.subtype").value_low == 4);
  assert(node(tree, *registry, "lldp.chassis.id").length == 6);
  assert(node(tree, *registry, "lldp.port.subtype").value_low == 5);
  assert(node(tree, *registry, "lldp.ttl").value_low == 120);
  assert(node(tree, *registry, "lldp.system_name").length == 6);
  assert(node(tree, *registry, "lldp.system_capabilities").value_low == 0x14);
  assert(node(tree, *registry, "lldp.management.address").length == 4);
  assert(node(tree, *registry, "lldp.management.interface_number").value_low ==
         7);
  assert(node(tree, *registry, "lldp.organization.oui").value_low == 0x0080c2);
  assert(node(tree, *registry, "eth.trailer").length == 7);

  const auto without_end = valid_lldp(false);
  const auto no_end_frame = ethernet_packet(0x88cc, without_end);
  const auto no_end = parser.parse(
      pruftnet::tests::raw_packet_view(no_end_frame, no_end_frame.size()));
  assert(no_end.condition() == ParseCondition::Complete);
  assert(node_count(no_end, *registry, "lldp.packet") == 1);
}

void lldp_rejects_bad_order_lengths_duplicates_and_shutdown_options() {
  const auto registry = core_registry();
  PacketParser parser(registry);
  auto reordered = valid_lldp();
  reordered[0] = std::byte{0x04};
  const auto reordered_frame = ethernet_packet(0x88cc, reordered);
  assert(parser
             .parse(pruftnet::tests::raw_packet_view(reordered_frame,
                                                     reordered_frame.size()))
             .condition() == ParseCondition::Malformed);

  std::vector<std::byte> overlong{std::byte{0x02}, std::byte{0x14},
                                  std::byte{4}};
  const auto overlong_frame = ethernet_packet(0x88cc, overlong);
  assert(parser
             .parse(pruftnet::tests::raw_packet_view(overlong_frame,
                                                     overlong_frame.size()))
             .condition() == ParseCondition::Malformed);

  auto duplicate = valid_lldp(false);
  const std::array extra_chassis{std::byte{7}, std::byte{'x'}};
  append_tlv(duplicate, 1, extra_chassis);
  const auto duplicate_frame = ethernet_packet(0x88cc, duplicate);
  assert(parser
             .parse(pruftnet::tests::raw_packet_view(duplicate_frame,
                                                     duplicate_frame.size()))
             .condition() == ParseCondition::Malformed);

  std::vector<std::byte> shutdown;
  const std::array chassis{std::byte{7}, std::byte{'c'}};
  const std::array port{std::byte{7}, std::byte{'p'}};
  const std::array ttl{std::byte{0}, std::byte{0}};
  append_tlv(shutdown, 1, chassis);
  append_tlv(shutdown, 2, port);
  append_tlv(shutdown, 3, ttl);
  const auto name = text_bytes("unexpected");
  append_tlv(shutdown, 5, name);
  append_tlv(shutdown, 0, std::span<const std::byte>{});
  const auto shutdown_frame = ethernet_packet(0x88cc, shutdown);
  assert(parser
             .parse(pruftnet::tests::raw_packet_view(shutdown_frame,
                                                     shutdown_frame.size()))
             .condition() == ParseCondition::Malformed);
}

void stp_rstp_and_mstp_dispatch_through_standard_encapsulations() {
  const auto registry = core_registry();
  PacketParser parser(registry);
  const auto configuration = bpdu(0, 0, 35);
  const auto configuration_frame = llc_bpdu(configuration);
  const auto configuration_tree = parser.parse(pruftnet::tests::raw_packet_view(
      configuration_frame, configuration_frame.size()));
  assert(configuration_tree.condition() == ParseCondition::Complete);
  assert(node(configuration_tree, *registry, "stp.root.priority").value_low ==
         0x8000);
  assert(node(configuration_tree, *registry, "stp.root.system_id_extension")
             .value_low == 0x123);
  assert(node(configuration_tree, *registry, "stp.root_path_cost").value_low ==
         10);

  const auto topology_change = bpdu(0, 0x80, 4);
  const auto topology_frame = llc_bpdu(topology_change);
  const auto topology_tree = parser.parse(
      pruftnet::tests::raw_packet_view(topology_frame, topology_frame.size()));
  assert(topology_tree.condition() == ParseCondition::Complete);
  assert(node(topology_tree, *registry, "stp.type").value_low == 0x80);

  const auto rapid = bpdu(2, 2, 36);
  const auto rapid_frame = ethernet_packet(0x8181, rapid);
  const auto rapid_tree = parser.parse(
      pruftnet::tests::raw_packet_view(rapid_frame, rapid_frame.size()));
  assert(rapid_tree.condition() == ParseCondition::Complete);
  assert(node(rapid_tree, *registry, "stp.version").value_low == 2);
  assert(node(rapid_tree, *registry, "stp.version_1_length").value_low == 0);

  const auto snap_frame = snap_bpdu(configuration);
  const auto snap_tree = parser.parse(
      pruftnet::tests::raw_packet_view(snap_frame, snap_frame.size()));
  assert(snap_tree.condition() == ParseCondition::Complete);
  assert(node_count(snap_tree, *registry, "snap.packet") == 1);
  assert(node_count(snap_tree, *registry, "stp.packet") == 1);

  auto multiple = bpdu(3, 2, 118);
  multiple[36] = std::byte{0};
  multiple[37] = std::byte{80};
  multiple[38] = std::byte{0};
  const auto region = text_bytes("region");
  std::copy(region.begin(), region.end(), multiple.begin() + 39);
  multiple[72] = std::byte{9};
  multiple[92] = std::byte{20};
  multiple[93] = std::byte{0xa4};
  multiple[94] = std::byte{0x56};
  multiple[95] = std::byte{1};
  multiple[100] = std::byte{6};
  multiple[101] = std::byte{15};
  multiple[102] = std::byte{0x7f};
  multiple[103] = std::byte{0xb0};
  multiple[104] = std::byte{7};
  multiple[105] = std::byte{0xaa};
  multiple[110] = std::byte{0xff};
  multiple[114] = std::byte{30};
  multiple[115] = std::byte{0x80};
  multiple[116] = std::byte{0x90};
  multiple[117] = std::byte{12};
  const auto multiple_frame = llc_bpdu(multiple);
  const auto multiple_tree = parser.parse(
      pruftnet::tests::raw_packet_view(multiple_frame, multiple_frame.size()));
  assert(multiple_tree.condition() == ParseCondition::Complete);
  assert(node(multiple_tree, *registry, "mstp.version_3_length").value_low ==
         80);
  assert(node(multiple_tree, *registry, "mstp.config_revision").value_low == 9);
  assert(node(multiple_tree, *registry, "mstp.cist.remaining_hops").value_low ==
         15);
  assert(node_count(multiple_tree, *registry, "mstp.instance") == 1);
  assert(node(multiple_tree, *registry, "mstp.instance.id").value_low == 7);
  assert(node(multiple_tree, *registry, "mstp.instance.remaining_hops")
             .value_low == 12);
}

void mstp_lengths_and_all_capture_boundaries_are_safe() {
  const auto registry = core_registry();
  PacketParser parser(registry);
  auto invalid = bpdu(3, 2, 103);
  invalid[36] = std::byte{0};
  invalid[37] = std::byte{65};
  const auto invalid_frame = llc_bpdu(invalid);
  assert(parser
             .parse(pruftnet::tests::raw_packet_view(invalid_frame,
                                                     invalid_frame.size()))
             .condition() == ParseCondition::Malformed);

  auto multiple = bpdu(3, 2, 102);
  multiple[36] = std::byte{0};
  multiple[37] = std::byte{64};
  const auto bytes = llc_bpdu(multiple);
  for (std::size_t captured = 0; captured < bytes.size(); ++captured) {
    const auto truncated = std::span<const std::byte>(bytes.data(), captured);
    const auto tree = parser.parse(pruftnet::tests::raw_packet_view(
        truncated, bytes.size(), 1, pruftnet::sniffing::PacketFlagTruncated));
    assert(tree.condition() == ParseCondition::Partial);
  }

  const auto lldp = ethernet_packet(0x88cc, valid_lldp());
  for (std::size_t captured = 0; captured < lldp.size(); ++captured) {
    const auto truncated = std::span<const std::byte>(lldp.data(), captured);
    const auto tree = parser.parse(pruftnet::tests::raw_packet_view(
        truncated, lldp.size(), 1, pruftnet::sniffing::PacketFlagTruncated));
    assert(tree.condition() == ParseCondition::Partial);
  }
}

} // namespace

int main() {
  lldp_parses_mandatory_and_common_optional_tlvs();
  lldp_rejects_bad_order_lengths_duplicates_and_shutdown_options();
  stp_rstp_and_mstp_dispatch_through_standard_encapsulations();
  mstp_lengths_and_all_capture_boundaries_are_safe();
}

#include <algorithm>
#include <array>
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

void set_u16(std::vector<std::byte> &bytes, std::size_t offset,
             std::uint16_t value) {
  bytes[offset] = static_cast<std::byte>(value >> 8U);
  bytes[offset + 1] = static_cast<std::byte>(value & 0xffU);
}

std::uint16_t internet_checksum(std::span<const std::byte> bytes) {
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

void set_igmp_checksum(std::vector<std::byte> &message) {
  message[2] = std::byte{0};
  message[3] = std::byte{0};
  set_u16(message, 2, internet_checksum(message));
}

std::vector<std::byte> ipv4_packet(std::span<const std::byte> payload) {
  const auto total_length = static_cast<std::uint16_t>(20 + payload.size());
  std::vector<std::byte> bytes(14 + total_length, std::byte{0});
  bytes[12] = std::byte{0x08};
  bytes[13] = std::byte{0x00};
  bytes[14] = std::byte{0x45};
  set_u16(bytes, 16, total_length);
  bytes[22] = std::byte{1};
  bytes[23] = std::byte{2};
  std::copy(payload.begin(), payload.end(), bytes.begin() + 34);
  return bytes;
}

std::vector<std::byte> ipv6_packet(std::span<const std::byte> payload) {
  std::vector<std::byte> bytes(14 + 40 + payload.size(), std::byte{0});
  bytes[12] = std::byte{0x86};
  bytes[13] = std::byte{0xdd};
  bytes[14] = std::byte{0x60};
  set_u16(bytes, 18, static_cast<std::uint16_t>(payload.size()));
  bytes[20] = std::byte{58};
  bytes[21] = std::byte{1};
  std::copy(payload.begin(), payload.end(), bytes.begin() + 54);
  return bytes;
}

void igmp_versions_queries_and_records_are_structured() {
  const auto registry = core_registry();
  PacketParser parser(registry);

  std::vector<std::byte> v2_query{
      std::byte{0x11}, std::byte{100}, std::byte{0}, std::byte{0},
      std::byte{0},    std::byte{0},   std::byte{0}, std::byte{0},
  };
  set_igmp_checksum(v2_query);
  const auto v2_packet = ipv4_packet(v2_query);
  const auto v2_tree = parser.parse(
      pruftnet::tests::raw_packet_view(v2_packet, v2_packet.size()));
  assert(v2_tree.condition() == ParseCondition::Complete);
  assert(node(v2_tree, *registry, "igmp.version").value_low == 2);
  assert(node(v2_tree, *registry, "igmp.max_response_time").value_low == 100);
  assert(node(v2_tree, *registry, "igmp.checksum_valid").value_low == 1);

  std::vector<std::byte> v3_query{
      std::byte{0x11}, std::byte{0x96}, std::byte{0}, std::byte{0},
      std::byte{239},  std::byte{1},    std::byte{2}, std::byte{3},
      std::byte{0x0a}, std::byte{0x81}, std::byte{0}, std::byte{1},
      std::byte{192},  std::byte{0},    std::byte{2}, std::byte{1},
  };
  set_igmp_checksum(v3_query);
  const auto v3_packet = ipv4_packet(v3_query);
  const auto v3_tree = parser.parse(
      pruftnet::tests::raw_packet_view(v3_packet, v3_packet.size()));
  assert(v3_tree.condition() == ParseCondition::Complete);
  assert(node(v3_tree, *registry, "igmp.version").value_low == 3);
  assert(node(v3_tree, *registry, "igmp.suppress").value_low == 1);
  assert(node(v3_tree, *registry, "igmp.qrv").value_low == 2);
  assert(node(v3_tree, *registry, "igmp.source_count").value_low == 1);
  assert(node(v3_tree, *registry, "igmp.source_address").length == 4);

  std::vector<std::byte> report{
      std::byte{0x22}, std::byte{0},    std::byte{0},    std::byte{0},
      std::byte{0},    std::byte{0},    std::byte{0},    std::byte{1},
      std::byte{1},    std::byte{1},    std::byte{0},    std::byte{1},
      std::byte{239},  std::byte{1},    std::byte{1},    std::byte{1},
      std::byte{198},  std::byte{51},   std::byte{100},  std::byte{1},
      std::byte{0xde}, std::byte{0xad}, std::byte{0xbe}, std::byte{0xef},
  };
  set_igmp_checksum(report);
  const auto report_packet = ipv4_packet(report);
  const auto report_tree = parser.parse(
      pruftnet::tests::raw_packet_view(report_packet, report_packet.size()));
  assert(report_tree.condition() == ParseCondition::Complete);
  assert(node_count(report_tree, *registry, "igmp.record") == 1);
  assert(node(report_tree, *registry, "igmp.record.type").value_low == 1);
  assert(node(report_tree, *registry, "igmp.record.aux_data").length == 4);
}

void mld_versions_queries_and_records_are_structured() {
  const auto registry = core_registry();
  PacketParser parser(registry);

  std::vector<std::byte> v1(24, std::byte{0});
  v1[0] = std::byte{130};
  set_u16(v1, 4, 1000);
  v1[8] = std::byte{0xff};
  v1[9] = std::byte{0x02};
  const auto v1_packet = ipv6_packet(v1);
  const auto v1_tree = parser.parse(
      pruftnet::tests::raw_packet_view(v1_packet, v1_packet.size()));
  assert(v1_tree.condition() == ParseCondition::Complete);
  assert(node(v1_tree, *registry, "mld.version").value_low == 1);
  assert(node(v1_tree, *registry, "mld.maximum_response_delay").value_low ==
         1000);

  std::vector<std::byte> v2(44, std::byte{0});
  v2[0] = std::byte{130};
  set_u16(v2, 4, 0x8001);
  v2[8] = std::byte{0xff};
  v2[9] = std::byte{0x05};
  v2[24] = std::byte{0x0b};
  v2[25] = std::byte{125};
  set_u16(v2, 26, 1);
  v2[28] = std::byte{0x20};
  v2[29] = std::byte{0x01};
  const auto v2_packet = ipv6_packet(v2);
  const auto v2_tree = parser.parse(
      pruftnet::tests::raw_packet_view(v2_packet, v2_packet.size()));
  assert(v2_tree.condition() == ParseCondition::Complete);
  assert(node(v2_tree, *registry, "mld.version").value_low == 2);
  assert(node(v2_tree, *registry, "mld.suppress").value_low == 1);
  assert(node(v2_tree, *registry, "mld.qrv").value_low == 3);
  assert(node(v2_tree, *registry, "mld.source_address").length == 16);

  std::vector<std::byte> report(8, std::byte{0});
  report[0] = std::byte{143};
  set_u16(report, 6, 1);
  report.push_back(std::byte{2});
  report.push_back(std::byte{1});
  append_u16(report, 1);
  report.insert(report.end(), 16, std::byte{0});
  report[12] = std::byte{0xff};
  report[13] = std::byte{0x05};
  report.insert(report.end(), 16, std::byte{0});
  report.push_back(std::byte{1});
  report.push_back(std::byte{2});
  report.push_back(std::byte{3});
  report.push_back(std::byte{4});
  const auto report_packet = ipv6_packet(report);
  const auto report_tree = parser.parse(
      pruftnet::tests::raw_packet_view(report_packet, report_packet.size()));
  assert(report_tree.condition() == ParseCondition::Complete);
  assert(node_count(report_tree, *registry, "mld.record") == 1);
  assert(node(report_tree, *registry, "mld.record.source_address").length ==
         16);
  assert(node(report_tree, *registry, "mld.record.aux_data").length == 4);
}

void invalid_lengths_checksums_and_truncation_are_distinct() {
  const auto registry = core_registry();
  PacketParser parser(registry);

  std::vector<std::byte> bad_checksum{
      std::byte{0x16}, std::byte{0}, std::byte{0}, std::byte{1},
      std::byte{239},  std::byte{1}, std::byte{1}, std::byte{1},
  };
  const auto bad_packet = ipv4_packet(bad_checksum);
  assert(parser
             .parse(pruftnet::tests::raw_packet_view(bad_packet,
                                                     bad_packet.size()))
             .condition() == ParseCondition::Malformed);

  std::vector<std::byte> bad_mld(28, std::byte{0});
  bad_mld[0] = std::byte{130};
  set_u16(bad_mld, 26, 1);
  const auto bad_mld_packet = ipv6_packet(bad_mld);
  assert(parser
             .parse(pruftnet::tests::raw_packet_view(bad_mld_packet,
                                                     bad_mld_packet.size()))
             .condition() == ParseCondition::Malformed);

  std::vector<std::byte> complete_mld(24, std::byte{0});
  complete_mld[0] = std::byte{131};
  complete_mld[8] = std::byte{0xff};
  const auto complete_packet = ipv6_packet(complete_mld);
  auto truncated = complete_packet;
  truncated.resize(truncated.size() - 3);
  const auto truncated_tree = parser.parse(pruftnet::tests::raw_packet_view(
      truncated, static_cast<std::uint32_t>(complete_packet.size())));
  assert(truncated_tree.condition() == ParseCondition::Partial);
}

} // namespace

int main() {
  igmp_versions_queries_and_records_are_structured();
  mld_versions_queries_and_records_are_structured();
  invalid_lengths_checksums_and_truncation_are_distinct();
}

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

std::vector<std::byte> ethernet_packet(std::uint16_t type,
                                       std::span<const std::byte> payload) {
  std::vector<std::byte> bytes(14 + payload.size(), std::byte{0});
  bytes[12] = static_cast<std::byte>(type >> 8U);
  bytes[13] = static_cast<std::byte>(type & 0xffU);
  std::copy(payload.begin(), payload.end(), bytes.begin() + 14);
  return bytes;
}

std::vector<std::byte> ipv4_packet(std::span<const std::byte> payload) {
  std::vector<std::byte> ip(20 + payload.size(), std::byte{0});
  ip[0] = std::byte{0x45};
  const auto length = static_cast<std::uint16_t>(ip.size());
  ip[2] = static_cast<std::byte>(length >> 8U);
  ip[3] = static_cast<std::byte>(length & 0xffU);
  ip[8] = std::byte{64};
  ip[9] = std::byte{1};
  std::copy(payload.begin(), payload.end(), ip.begin() + 20);
  return ethernet_packet(0x0800, ip);
}

std::vector<std::byte> ipv6_packet(std::span<const std::byte> payload) {
  std::vector<std::byte> ip(40 + payload.size(), std::byte{0});
  ip[0] = std::byte{0x60};
  const auto length = static_cast<std::uint16_t>(payload.size());
  ip[4] = static_cast<std::byte>(length >> 8U);
  ip[5] = static_cast<std::byte>(length & 0xffU);
  ip[6] = std::byte{58};
  ip[7] = std::byte{64};
  ip[8] = std::byte{0x20};
  ip[9] = std::byte{1};
  ip[24] = std::byte{0x20};
  ip[25] = std::byte{1};
  std::copy(payload.begin(), payload.end(), ip.begin() + 40);
  return ethernet_packet(0x86dd, ip);
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

void set_extension_checksum(std::vector<std::byte> &extension) {
  extension[2] = std::byte{0};
  extension[3] = std::byte{0};
  const auto checksum = internet_checksum(extension);
  extension[2] = static_cast<std::byte>(checksum >> 8U);
  extension[3] = static_cast<std::byte>(checksum & 0xffU);
}

std::vector<std::byte> mpls_extension(bool with_checksum = false) {
  std::vector<std::byte> extension{
      std::byte{0x20}, std::byte{0}, std::byte{0},    std::byte{0},
      std::byte{0},    std::byte{8}, std::byte{1},    std::byte{1},
      std::byte{0},    std::byte{1}, std::byte{0x0b}, std::byte{0x40},
  };
  if (with_checksum) {
    set_extension_checksum(extension);
  }
  return extension;
}

std::vector<std::byte> interface_identification_extension() {
  return {
      std::byte{0x20}, std::byte{0}, std::byte{0}, std::byte{0},
      std::byte{0},    std::byte{8}, std::byte{3}, std::byte{2},
      std::byte{0},    std::byte{0}, std::byte{0}, std::byte{7},
  };
}

std::vector<std::byte> icmpv4_rfc4884(std::vector<std::byte> extension) {
  std::vector<std::byte> message(8 + 128, std::byte{0});
  message[0] = std::byte{11};
  message[5] = std::byte{32};
  message[8] = std::byte{0x45};
  message.insert(message.end(), extension.begin(), extension.end());
  return message;
}

std::vector<std::byte> icmpv6_rfc4884(std::vector<std::byte> extension) {
  std::vector<std::byte> message(8 + 128, std::byte{0});
  message[0] = std::byte{1};
  message[1] = std::byte{9};
  message[4] = std::byte{16};
  message[8] = std::byte{0x60};
  message.insert(message.end(), extension.begin(), extension.end());
  return message;
}

void rfc4884_lengths_and_mpls_objects_are_structured() {
  const auto registry = core_registry();
  PacketParser parser(registry);

  const auto v4 = ipv4_packet(icmpv4_rfc4884(mpls_extension(true)));
  const auto v4_tree =
      parser.parse(pruftnet::tests::raw_packet_view(v4, v4.size()));
  assert(v4_tree.condition() == ParseCondition::Complete);
  assert(node(v4_tree, *registry, "icmp.original_datagram_length_words")
             .value_low == 32);
  assert(node(v4_tree, *registry, "icmp.original_datagram_length").value_low ==
         128);
  assert(node(v4_tree, *registry, "icmp.quoted").length == 128);
  assert(node(v4_tree, *registry, "icmp_ext.version").value_low == 2);
  assert(node(v4_tree, *registry, "icmp_ext.checksum_valid").value_low == 1);
  assert(node(v4_tree, *registry, "icmp_ext.mpls_label").value_low == 16);
  assert(node(v4_tree, *registry, "icmp_ext.mpls_traffic_class").value_low ==
         5);
  assert(node(v4_tree, *registry, "icmp_ext.mpls_bottom_of_stack").value_low ==
         1);
  assert(node(v4_tree, *registry, "icmp_ext.mpls_ttl").value_low == 64);

  const auto v6 = ipv6_packet(icmpv6_rfc4884(mpls_extension()));
  const auto v6_tree =
      parser.parse(pruftnet::tests::raw_packet_view(v6, v6.size()));
  assert(v6_tree.condition() == ParseCondition::Complete);
  assert(node(v6_tree, *registry, "icmpv6.code").value_low == 9);
  assert(node(v6_tree, *registry, "icmpv6.original_datagram_length_words")
             .value_low == 16);
  assert(
      node(v6_tree, *registry, "icmpv6.original_datagram_length").value_low ==
      128);
  assert(node(v6_tree, *registry, "icmpv6.quoted").length == 128);
  assert(node_count(v6_tree, *registry, "icmp_ext.object") == 1);
}

void malformed_extension_boundaries_are_rejected() {
  const auto registry = core_registry();
  PacketParser parser(registry);

  auto short_original = icmpv4_rfc4884(mpls_extension());
  short_original[5] = std::byte{31};
  const auto short_packet = ipv4_packet(short_original);
  assert(parser
             .parse(pruftnet::tests::raw_packet_view(short_packet,
                                                     short_packet.size()))
             .condition() == ParseCondition::Malformed);

  auto overrun = icmpv4_rfc4884(mpls_extension());
  overrun[5] = std::byte{40};
  const auto overrun_packet = ipv4_packet(overrun);
  assert(parser
             .parse(pruftnet::tests::raw_packet_view(overrun_packet,
                                                     overrun_packet.size()))
             .condition() == ParseCondition::Malformed);

  auto bad_object = mpls_extension();
  bad_object[5] = std::byte{6};
  const auto bad_object_packet = ipv4_packet(icmpv4_rfc4884(bad_object));
  assert(parser
             .parse(pruftnet::tests::raw_packet_view(bad_object_packet,
                                                     bad_object_packet.size()))
             .condition() == ParseCondition::Malformed);

  auto bad_checksum = mpls_extension();
  bad_checksum[3] = std::byte{1};
  const auto checksum_packet = ipv4_packet(icmpv4_rfc4884(bad_checksum));
  const auto checksum_tree = parser.parse(pruftnet::tests::raw_packet_view(
      checksum_packet, checksum_packet.size()));
  assert(checksum_tree.condition() == ParseCondition::Malformed);
  assert(node(checksum_tree, *registry, "icmp_ext.checksum_valid").value_low ==
         0);

  auto bad_version = mpls_extension();
  bad_version[0] = std::byte{0x30};
  const auto version_packet = ipv4_packet(icmpv4_rfc4884(bad_version));
  assert(parser
             .parse(pruftnet::tests::raw_packet_view(version_packet,
                                                     version_packet.size()))
             .condition() == ParseCondition::Malformed);

  auto bad_reserved = mpls_extension();
  bad_reserved[1] = std::byte{1};
  const auto reserved_packet = ipv4_packet(icmpv4_rfc4884(bad_reserved));
  assert(parser
             .parse(pruftnet::tests::raw_packet_view(reserved_packet,
                                                     reserved_packet.size()))
             .condition() == ParseCondition::Malformed);
}

void extended_echo_requests_and_replies_are_bounded() {
  const auto registry = core_registry();
  PacketParser parser(registry);
  const auto extension = interface_identification_extension();

  std::vector<std::byte> v4_request{
      std::byte{42},   std::byte{0},    std::byte{0}, std::byte{0},
      std::byte{0x12}, std::byte{0x34}, std::byte{7}, std::byte{1},
  };
  v4_request.insert(v4_request.end(), extension.begin(), extension.end());
  const auto v4_packet = ipv4_packet(v4_request);
  const auto v4_tree = parser.parse(
      pruftnet::tests::raw_packet_view(v4_packet, v4_packet.size()));
  assert(v4_tree.condition() == ParseCondition::Complete);
  assert(node(v4_tree, *registry, "icmp.identifier").value_low == 0x1234);
  assert(node(v4_tree, *registry, "icmp.extended_sequence").value_low == 7);
  assert(node(v4_tree, *registry, "icmp.extended_flags").value_low == 1);
  assert(node(v4_tree, *registry, "icmp_ext.object.class").value_low == 3);

  auto v6_request = v4_request;
  v6_request[0] = std::byte{160};
  const auto v6_packet = ipv6_packet(v6_request);
  const auto v6_tree = parser.parse(
      pruftnet::tests::raw_packet_view(v6_packet, v6_packet.size()));
  assert(v6_tree.condition() == ParseCondition::Complete);
  assert(node(v6_tree, *registry, "icmpv6.extended_sequence").value_low == 7);

  const std::array missing_extension{
      std::byte{42}, std::byte{0}, std::byte{0}, std::byte{0},
      std::byte{0},  std::byte{1}, std::byte{0}, std::byte{0},
  };
  const auto missing_packet = ipv4_packet(missing_extension);
  assert(parser
             .parse(pruftnet::tests::raw_packet_view(missing_packet,
                                                     missing_packet.size()))
             .condition() == ParseCondition::Malformed);

  std::vector<std::byte> wrong_object(missing_extension.begin(),
                                      missing_extension.end());
  const auto mpls = mpls_extension();
  wrong_object.insert(wrong_object.end(), mpls.begin(), mpls.end());
  const auto wrong_packet = ipv4_packet(wrong_object);
  assert(parser
             .parse(pruftnet::tests::raw_packet_view(wrong_packet,
                                                     wrong_packet.size()))
             .condition() == ParseCondition::Malformed);

  const std::array v4_reply{
      std::byte{43}, std::byte{0}, std::byte{0}, std::byte{0},
      std::byte{0},  std::byte{1}, std::byte{9}, std::byte{7},
  };
  const auto reply_packet = ipv4_packet(v4_reply);
  assert(parser
             .parse(pruftnet::tests::raw_packet_view(reply_packet,
                                                     reply_packet.size()))
             .condition() == ParseCondition::Complete);

  auto invalid_reply = v4_reply;
  invalid_reply[1] = std::byte{1};
  const auto invalid_reply_packet = ipv4_packet(invalid_reply);
  assert(parser
             .parse(pruftnet::tests::raw_packet_view(
                 invalid_reply_packet, invalid_reply_packet.size()))
             .condition() == ParseCondition::Malformed);
}

void legacy_icmpv4_families_are_structured() {
  const auto registry = core_registry();
  PacketParser parser(registry);

  std::array<std::byte, 20> timestamp{};
  timestamp[0] = std::byte{13};
  timestamp[4] = std::byte{0x12};
  timestamp[5] = std::byte{0x34};
  timestamp[7] = std::byte{2};
  timestamp[11] = std::byte{1};
  timestamp[15] = std::byte{2};
  timestamp[19] = std::byte{3};
  const auto timestamp_packet = ipv4_packet(timestamp);
  const auto timestamp_tree = parser.parse(pruftnet::tests::raw_packet_view(
      timestamp_packet, timestamp_packet.size()));
  assert(timestamp_tree.condition() == ParseCondition::Complete);
  assert(
      node(timestamp_tree, *registry, "icmp.originate_timestamp").value_low ==
      1);
  assert(node(timestamp_tree, *registry, "icmp.receive_timestamp").value_low ==
         2);
  assert(node(timestamp_tree, *registry, "icmp.transmit_timestamp").value_low ==
         3);

  std::array<std::byte, 12> mask{};
  mask[0] = std::byte{18};
  mask[8] = std::byte{255};
  mask[9] = std::byte{255};
  const auto mask_packet = ipv4_packet(mask);
  const auto mask_tree = parser.parse(
      pruftnet::tests::raw_packet_view(mask_packet, mask_packet.size()));
  assert(mask_tree.condition() == ParseCondition::Complete);
  assert(node(mask_tree, *registry, "icmp.address_mask").length == 4);

  std::array<std::byte, 24> advertisement{};
  advertisement[0] = std::byte{9};
  advertisement[4] = std::byte{2};
  advertisement[5] = std::byte{2};
  advertisement[7] = std::byte{30};
  advertisement[8] = std::byte{192};
  advertisement[11] = std::byte{1};
  advertisement[16] = std::byte{192};
  advertisement[19] = std::byte{2};
  advertisement[23] = std::byte{10};
  const auto advertisement_packet = ipv4_packet(advertisement);
  const auto advertisement_tree = parser.parse(pruftnet::tests::raw_packet_view(
      advertisement_packet, advertisement_packet.size()));
  assert(advertisement_tree.condition() == ParseCondition::Complete);
  assert(node_count(advertisement_tree, *registry, "icmp.router_entry") == 2);
  assert(
      node(advertisement_tree, *registry, "icmp.router_lifetime").value_low ==
      30);
}

void current_icmpv6_codes_and_inverse_nd_are_recognized() {
  const auto registry = core_registry();
  PacketParser parser(registry);

  std::array<std::byte, 9> parameter_problem{};
  parameter_problem[0] = std::byte{4};
  parameter_problem[1] = std::byte{10};
  parameter_problem[7] = std::byte{4};
  parameter_problem[8] = std::byte{0x60};
  const auto supported_packet = ipv6_packet(parameter_problem);
  const auto supported_tree = parser.parse(pruftnet::tests::raw_packet_view(
      supported_packet, supported_packet.size()));
  assert(supported_tree.condition() == ParseCondition::Complete);
  assert(node(supported_tree, *registry, "icmpv6.pointer").value_low == 4);
  assert(node(supported_tree, *registry, "icmpv6.quoted").length == 1);

  auto unsupported = parameter_problem;
  unsupported[1] = std::byte{11};
  const auto unsupported_packet = ipv6_packet(unsupported);
  const auto unsupported_tree = parser.parse(pruftnet::tests::raw_packet_view(
      unsupported_packet, unsupported_packet.size()));
  assert(node_count(unsupported_tree, *registry, "icmpv6.pointer") == 0);
  assert(node(unsupported_tree, *registry, "icmpv6.body").length == 5);

  std::array<std::byte, 16> inverse{};
  inverse[0] = std::byte{141};
  inverse[8] = std::byte{1};
  inverse[9] = std::byte{1};
  inverse[10] = std::byte{0xaa};
  const auto inverse_packet = ipv6_packet(inverse);
  const auto inverse_tree = parser.parse(
      pruftnet::tests::raw_packet_view(inverse_packet, inverse_packet.size()));
  assert(inverse_tree.condition() == ParseCondition::Complete);
  assert(node(inverse_tree, *registry, "icmpv6.option_type").value_low == 1);
  assert(node(inverse_tree, *registry, "icmpv6.link_layer_address").length ==
         6);
}

void extended_paths_preserve_capture_boundaries() {
  const auto registry = core_registry();
  PacketParser parser(registry);

  const auto v4 = ipv4_packet(icmpv4_rfc4884(mpls_extension()));
  for (std::size_t captured = 0; captured < v4.size(); ++captured) {
    const auto span = std::span<const std::byte>(v4.data(), captured);
    assert(parser
               .parse(pruftnet::tests::raw_packet_view(
                   span, v4.size(), 1, pruftnet::sniffing::PacketFlagTruncated))
               .condition() == ParseCondition::Partial);
  }

  std::vector<std::byte> request{
      std::byte{160}, std::byte{0}, std::byte{0}, std::byte{0},
      std::byte{0},   std::byte{1}, std::byte{2}, std::byte{1},
  };
  const auto extension = interface_identification_extension();
  request.insert(request.end(), extension.begin(), extension.end());
  const auto v6 = ipv6_packet(request);
  for (std::size_t captured = 0; captured < v6.size(); ++captured) {
    const auto span = std::span<const std::byte>(v6.data(), captured);
    assert(parser
               .parse(pruftnet::tests::raw_packet_view(
                   span, v6.size(), 1, pruftnet::sniffing::PacketFlagTruncated))
               .condition() == ParseCondition::Partial);
  }
}

} // namespace

int main() {
  rfc4884_lengths_and_mpls_objects_are_structured();
  malformed_extension_boundaries_are_rejected();
  extended_echo_requests_and_replies_are_bounded();
  legacy_icmpv4_families_are_structured();
  current_icmpv6_codes_and_inverse_nd_are_recognized();
  extended_paths_preserve_capture_boundaries();
}

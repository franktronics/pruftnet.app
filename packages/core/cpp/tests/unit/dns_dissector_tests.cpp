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

void append_name(std::vector<std::byte> &bytes, std::string_view name) {
  std::size_t start = 0;
  while (start < name.size()) {
    const auto end = name.find('.', start);
    const auto length =
        (end == std::string_view::npos ? name.size() : end) - start;
    bytes.push_back(static_cast<std::byte>(length));
    for (std::size_t index = 0; index < length; ++index) {
      bytes.push_back(static_cast<std::byte>(
          static_cast<unsigned char>(name[start + index])));
    }
    if (end == std::string_view::npos) {
      break;
    }
    start = end + 1;
  }
  bytes.push_back(std::byte{0});
}

std::vector<std::byte> dns_header(std::uint16_t id, std::uint16_t flags,
                                  std::uint16_t questions,
                                  std::uint16_t answers = 0,
                                  std::uint16_t authorities = 0,
                                  std::uint16_t additionals = 0) {
  std::vector<std::byte> bytes;
  append_u16(bytes, id);
  append_u16(bytes, flags);
  append_u16(bytes, questions);
  append_u16(bytes, answers);
  append_u16(bytes, authorities);
  append_u16(bytes, additionals);
  return bytes;
}

std::vector<std::byte> dns_query(std::string_view name = "www.example.com") {
  auto bytes = dns_header(0x1234, 0x0100, 1);
  append_name(bytes, name);
  append_u16(bytes, 1);
  append_u16(bytes, 1);
  return bytes;
}

void set_u16(std::vector<std::byte> &bytes, std::size_t offset,
             std::uint16_t value) {
  bytes[offset] = static_cast<std::byte>(value >> 8U);
  bytes[offset + 1] = static_cast<std::byte>(value & 0xffU);
}

std::vector<std::byte>
ethernet_ipv4_transport(std::uint8_t protocol, std::uint16_t source_port,
                        std::uint16_t destination_port,
                        std::span<const std::byte> payload,
                        std::uint32_t sequence = 0) {
  const auto transport_header = protocol == 17 ? std::size_t{8} : 20;
  const auto transport_length = transport_header + payload.size();
  const auto ip_length = static_cast<std::uint16_t>(20 + transport_length);
  std::vector<std::byte> bytes(14 + ip_length, std::byte{0});
  bytes[12] = std::byte{0x08};
  bytes[13] = std::byte{0x00};
  bytes[14] = std::byte{0x45};
  set_u16(bytes, 16, ip_length);
  bytes[22] = std::byte{64};
  bytes[23] = static_cast<std::byte>(protocol);
  set_u16(bytes, 34, source_port);
  set_u16(bytes, 36, destination_port);
  if (protocol == 17) {
    set_u16(bytes, 38, static_cast<std::uint16_t>(transport_length));
  } else {
    bytes[38] = static_cast<std::byte>(sequence >> 24U);
    bytes[39] = static_cast<std::byte>((sequence >> 16U) & 0xffU);
    bytes[40] = static_cast<std::byte>((sequence >> 8U) & 0xffU);
    bytes[41] = static_cast<std::byte>(sequence & 0xffU);
    bytes[46] = std::byte{0x50};
  }
  std::copy(payload.begin(), payload.end(),
            bytes.begin() +
                static_cast<std::ptrdiff_t>(14 + 20 + transport_header));
  return bytes;
}

ParsedPacketTree parse(PacketParser &parser,
                       const std::vector<std::byte> &bytes,
                       std::uint32_t wire_length = 0,
                       std::uint64_t packet_id = 1) {
  return parser.parse(pruftnet::sniffing::RawPacketView{
      .metadata =
          {
              .key =
                  {
                      .capture_id = {.high = 1, .low = 2},
                      .packet_id = packet_id,
                  },
              .captured_len = static_cast<std::uint32_t>(bytes.size()),
              .wire_len = wire_length == 0
                              ? static_cast<std::uint32_t>(bytes.size())
                              : wire_length,
              .link_type = 1,
          },
      .bytes = bytes,
  });
}

void udp_dispatch_and_compressed_answers_are_structured() {
  const auto registry = core_registry();
  PacketParser parser(registry);

  auto message = dns_header(0x1234, 0x8180, 1, 1);
  append_name(message, "www.example.com");
  append_u16(message, 1);
  append_u16(message, 1);
  append_u16(message, 0xc00c);
  append_u16(message, 1);
  append_u16(message, 1);
  append_u32(message, 60);
  append_u16(message, 4);
  message.insert(message.end(),
                 {std::byte{192}, std::byte{0}, std::byte{2}, std::byte{1}});

  const auto packet = ethernet_ipv4_transport(17, 40000, 53, message);
  const auto tree = parse(parser, packet);
  assert(tree.condition() == ParseCondition::Complete);
  assert(node_count(tree, *registry, "dns.message") == 1);
  assert(node_count(tree, *registry, "udp.payload") == 0);
  assert(tree.node_text(node(tree, *registry, "dns.question.name")) ==
         "www.example.com");
  assert(tree.node_text(node(tree, *registry, "dns.record.name")) ==
         "www.example.com");
  assert(node(tree, *registry, "dns.address").length == 4);
  assert(node(tree, *registry, "dns.record.section").value_low == 1);
}

void mdns_srv_and_class_bits_are_explicit() {
  const auto registry = core_registry();
  PacketParser parser(registry);

  auto message = dns_header(0, 0x8400, 0, 1);
  append_name(message, "_service._tcp.local");
  append_u16(message, 33);
  append_u16(message, 0x8001);
  append_u32(message, 120);
  std::vector<std::byte> rdata;
  append_u16(rdata, 10);
  append_u16(rdata, 20);
  append_u16(rdata, 8080);
  append_name(rdata, "host.local");
  append_u16(message, static_cast<std::uint16_t>(rdata.size()));
  message.insert(message.end(), rdata.begin(), rdata.end());

  const auto packet = ethernet_ipv4_transport(17, 5353, 5353, message);
  const auto tree = parse(parser, packet);
  assert(tree.condition() == ParseCondition::Complete);
  assert(node_count(tree, *registry, "mdns.message") == 1);
  assert(node(tree, *registry, "mdns.record.cache_flush").value_low == 1);
  assert(node(tree, *registry, "dns.record.class").value_low == 1);
  assert(node(tree, *registry, "dns.priority").value_low == 10);
  assert(node(tree, *registry, "dns.weight").value_low == 20);
  assert(node(tree, *registry, "dns.port").value_low == 8080);
  assert(tree.node_text(node(tree, *registry, "dns.target")) == "host.local");
}

void llmnr_and_edns_fields_follow_their_wire_layouts() {
  const auto registry = core_registry();
  PacketParser parser(registry);

  auto llmnr = dns_header(7, 0x0100, 1);
  append_name(llmnr, "printer");
  append_u16(llmnr, 1);
  append_u16(llmnr, 1);
  const auto llmnr_packet = ethernet_ipv4_transport(17, 49152, 5355, llmnr);
  const auto llmnr_tree = parse(parser, llmnr_packet);
  assert(llmnr_tree.condition() == ParseCondition::Complete);
  assert(node_count(llmnr_tree, *registry, "llmnr.message") == 1);
  assert(node(llmnr_tree, *registry, "llmnr.tentative").value_low == 1);

  auto edns = dns_header(8, 0x0100, 0, 0, 0, 1);
  edns.push_back(std::byte{0});
  append_u16(edns, 41);
  append_u16(edns, 1232);
  append_u32(edns, 0x01008000);
  append_u16(edns, 6);
  append_u16(edns, 8);
  append_u16(edns, 2);
  append_u16(edns, 0x1234);
  const auto edns_packet = ethernet_ipv4_transport(17, 40000, 53, edns);
  const auto edns_tree = parse(parser, edns_packet);
  assert(edns_tree.condition() == ParseCondition::Complete);
  assert(node(edns_tree, *registry, "dns.edns.udp_payload_size").value_low ==
         1232);
  assert(node(edns_tree, *registry, "dns.edns.extended_rcode").value_low == 1);
  assert(node(edns_tree, *registry, "dns.edns.flags").value_low == 0x8000);
  assert(node(edns_tree, *registry, "dns.edns.option.code").value_low == 8);
  assert(node(edns_tree, *registry, "dns.edns.option.length").value_low == 2);
}

void tcp_framing_supports_multiple_and_incomplete_messages() {
  const auto registry = core_registry();
  PacketParser parser(registry);

  const auto first = dns_query("one.example");
  const auto second = dns_query("two.example");
  std::vector<std::byte> stream;
  append_u16(stream, static_cast<std::uint16_t>(first.size()));
  stream.insert(stream.end(), first.begin(), first.end());
  append_u16(stream, static_cast<std::uint16_t>(second.size()));
  stream.insert(stream.end(), second.begin(), second.end());
  const auto packet = ethernet_ipv4_transport(6, 50000, 53, stream);
  const auto tree = parse(parser, packet);
  assert(tree.condition() == ParseCondition::Complete);
  assert(node_count(tree, *registry, "dns.tcp_length") == 2);
  assert(node_count(tree, *registry, "dns.message") == 2);
  assert(node_count(tree, *registry, "tcp.payload") == 0);

  std::vector<std::byte> incomplete;
  append_u16(incomplete, 64);
  incomplete.insert(incomplete.end(), first.begin(), first.begin() + 5);
  const auto incomplete_packet =
      ethernet_ipv4_transport(6, 50000, 53, incomplete);
  const auto incomplete_tree = parse(parser, incomplete_packet);
  assert(incomplete_tree.condition() == ParseCondition::Complete);
  assert(node_count(incomplete_tree, *registry, "dns.message") == 0);
  assert(node(incomplete_tree, *registry, "dns.trailing").length == 5);
}

void malformed_names_lengths_and_capture_truncation_are_distinct() {
  const auto registry = core_registry();
  PacketParser parser(registry);

  auto loop = dns_header(1, 0x0100, 1);
  append_u16(loop, 0xc00c);
  append_u16(loop, 1);
  append_u16(loop, 1);
  const auto loop_packet = ethernet_ipv4_transport(17, 40000, 53, loop);
  assert(parse(parser, loop_packet).condition() == ParseCondition::Malformed);

  auto invalid_a = dns_header(1, 0x8180, 0, 1);
  invalid_a.push_back(std::byte{0});
  append_u16(invalid_a, 1);
  append_u16(invalid_a, 1);
  append_u32(invalid_a, 1);
  append_u16(invalid_a, 3);
  invalid_a.insert(invalid_a.end(), {std::byte{1}, std::byte{2}, std::byte{3}});
  const auto invalid_packet = ethernet_ipv4_transport(17, 53, 40000, invalid_a);
  assert(parse(parser, invalid_packet).condition() ==
         ParseCondition::Malformed);

  const auto complete_message = dns_query();
  const auto complete_packet =
      ethernet_ipv4_transport(17, 40000, 53, complete_message);
  auto truncated_packet = complete_packet;
  truncated_packet.resize(truncated_packet.size() - 3);
  const auto truncated_tree =
      parse(parser, truncated_packet,
            static_cast<std::uint32_t>(complete_packet.size()));
  assert(truncated_tree.condition() == ParseCondition::Partial);
}

void tcp_messages_reassemble_across_segments_with_packet_provenance() {
  const auto registry = core_registry();
  PacketParser parser(registry);

  const auto message = dns_query("split.example");
  std::vector<std::byte> framed;
  append_u16(framed, static_cast<std::uint16_t>(message.size()));
  framed.insert(framed.end(), message.begin(), message.end());
  constexpr std::size_t split = 7;
  const auto first_packet = ethernet_ipv4_transport(
      6, 50'000, 53, std::span(framed).first(split), 1'000);
  const auto second_packet =
      ethernet_ipv4_transport(6, 50'000, 53, std::span(framed).subspan(split),
                              1'000 + static_cast<std::uint32_t>(split));

  const auto first = parse(parser, first_packet, 0, 1);
  assert(first.condition() == ParseCondition::Complete);
  assert(node_count(first, *registry, "dns.message") == 0);

  const auto second = parse(parser, second_packet, 0, 2);
  assert(second.condition() == ParseCondition::Complete);
  assert(node_count(second, *registry, "dns.message") == 1);
  assert(second.node_text(node(second, *registry, "dns.question.name")) ==
         "split.example");
  assert(node(second, *registry, "tcp.reassembled_segment_count").value_low ==
         2);
  assert(node(second, *registry, "tcp.reassembled_length").value_low ==
         framed.size());
  assert(second.data_sources().size() == 2);
  const auto &source = second.data_sources()[1];
  assert(second.source_name(source) == "Reassembled TCP stream");
  const auto contributors = second.source_contributors(source);
  assert(contributors.size() == 2);
  assert(std::any_of(
      contributors.begin(), contributors.end(), [](const auto &item) {
        return item.packet_key.packet_id == 1 && item.destination_offset == 0;
      }));
  assert(std::any_of(contributors.begin(), contributors.end(),
                     [split](const auto &item) {
                       return item.packet_key.packet_id == 2 &&
                              item.destination_offset == split;
                     }));
}

} // namespace

int main() {
  udp_dispatch_and_compressed_answers_are_structured();
  mdns_srv_and_class_bits_are_explicit();
  llmnr_and_edns_fields_follow_their_wire_layouts();
  tcp_framing_supports_multiple_and_incomplete_messages();
  malformed_names_lengths_and_capture_truncation_are_distinct();
  tcp_messages_reassemble_across_segments_with_packet_provenance();
}

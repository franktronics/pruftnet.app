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

void set_u32(std::vector<std::byte> &bytes, std::size_t offset,
             std::uint32_t value) {
  bytes[offset] = static_cast<std::byte>(value >> 24U);
  bytes[offset + 1] = static_cast<std::byte>((value >> 16U) & 0xffU);
  bytes[offset + 2] = static_cast<std::byte>((value >> 8U) & 0xffU);
  bytes[offset + 3] = static_cast<std::byte>(value & 0xffU);
}

void append_u16(std::vector<std::byte> &bytes, std::uint16_t value) {
  bytes.push_back(static_cast<std::byte>(value >> 8U));
  bytes.push_back(static_cast<std::byte>(value & 0xffU));
}

void append_u24(std::vector<std::byte> &bytes, std::size_t value) {
  bytes.push_back(static_cast<std::byte>((value >> 16U) & 0xffU));
  bytes.push_back(static_cast<std::byte>((value >> 8U) & 0xffU));
  bytes.push_back(static_cast<std::byte>(value & 0xffU));
}

void append(std::vector<std::byte> &destination,
            std::span<const std::byte> source) {
  destination.insert(destination.end(), source.begin(), source.end());
}

std::vector<std::byte> ascii(std::string_view value) {
  std::vector<std::byte> result;
  result.reserve(value.size());
  for (const auto character : value) {
    result.push_back(
        static_cast<std::byte>(static_cast<unsigned char>(character)));
  }
  return result;
}

std::vector<std::byte> extension(std::uint16_t type,
                                 std::span<const std::byte> data) {
  std::vector<std::byte> result;
  append_u16(result, type);
  append_u16(result, static_cast<std::uint16_t>(data.size()));
  append(result, data);
  return result;
}

std::vector<std::byte> handshake(std::uint8_t type,
                                 std::span<const std::byte> body) {
  std::vector<std::byte> result;
  result.push_back(static_cast<std::byte>(type));
  append_u24(result, body.size());
  append(result, body);
  return result;
}

std::vector<std::byte> tls_record(std::uint8_t content_type,
                                  std::span<const std::byte> payload,
                                  std::uint16_t version = 0x0303) {
  std::vector<std::byte> result;
  result.push_back(static_cast<std::byte>(content_type));
  append_u16(result, version);
  append_u16(result, static_cast<std::uint16_t>(payload.size()));
  append(result, payload);
  return result;
}

std::vector<std::byte> client_hello() {
  std::vector<std::byte> body;
  append_u16(body, 0x0303);
  for (std::uint8_t value = 0; value < 32; ++value) {
    body.push_back(static_cast<std::byte>(value));
  }
  body.push_back(std::byte{0});
  append_u16(body, 4);
  append_u16(body, 0x1301);
  append_u16(body, 0xc02f);
  body.push_back(std::byte{1});
  body.push_back(std::byte{0});

  std::vector<std::byte> extensions;
  const auto host = ascii("example.com");
  std::vector<std::byte> server_name;
  append_u16(server_name, static_cast<std::uint16_t>(1 + 2 + host.size()));
  server_name.push_back(std::byte{0});
  append_u16(server_name, static_cast<std::uint16_t>(host.size()));
  append(server_name, host);
  append(extensions, extension(0, server_name));

  const std::vector supported_versions{std::byte{4}, std::byte{0x03},
                                       std::byte{0x04}, std::byte{0x03},
                                       std::byte{0x03}};
  append(extensions, extension(43, supported_versions));

  const std::vector alpn{std::byte{0}, std::byte{3}, std::byte{2},
                         std::byte{'h'}, std::byte{'2'}};
  append(extensions, extension(16, alpn));

  const std::vector groups{std::byte{0},    std::byte{4}, std::byte{0},
                           std::byte{0x1d}, std::byte{0}, std::byte{0x17}};
  append(extensions, extension(10, groups));

  const std::vector signatures{std::byte{0},    std::byte{4},
                               std::byte{0x08}, std::byte{0x04},
                               std::byte{0x04}, std::byte{0x03}};
  append(extensions, extension(13, signatures));

  append_u16(body, static_cast<std::uint16_t>(extensions.size()));
  append(body, extensions);
  return handshake(1, body);
}

std::vector<std::byte> server_hello() {
  std::vector<std::byte> body;
  append_u16(body, 0x0303);
  body.insert(body.end(), 32, std::byte{0x5a});
  body.push_back(std::byte{0});
  append_u16(body, 0x1301);
  body.push_back(std::byte{0});

  std::vector<std::byte> extensions;
  const std::vector selected_version{std::byte{0x03}, std::byte{0x04}};
  append(extensions, extension(43, selected_version));
  append(extensions, extension(0, {}));
  append_u16(body, static_cast<std::uint16_t>(extensions.size()));
  append(body, extensions);
  return handshake(2, body);
}

std::vector<std::byte> tcp_packet(std::span<const std::byte> payload,
                                  std::uint32_t sequence = 0,
                                  std::uint8_t flags = 0x18,
                                  std::uint16_t source_port = 50'000,
                                  std::uint16_t destination_port = 443) {
  const auto ip_length = static_cast<std::uint16_t>(20 + 20 + payload.size());
  std::vector<std::byte> result(14 + ip_length, std::byte{0});
  result[12] = std::byte{0x08};
  result[13] = std::byte{0x00};
  result[14] = std::byte{0x45};
  set_u16(result, 16, ip_length);
  result[22] = std::byte{64};
  result[23] = std::byte{6};
  result[26] = std::byte{192};
  result[27] = std::byte{0};
  result[28] = std::byte{2};
  result[29] = std::byte{1};
  result[30] = std::byte{198};
  result[31] = std::byte{51};
  result[32] = std::byte{100};
  result[33] = std::byte{2};
  set_u16(result, 34, source_port);
  set_u16(result, 36, destination_port);
  set_u32(result, 38, sequence);
  result[46] = std::byte{0x50};
  result[47] = static_cast<std::byte>(flags);
  std::copy(payload.begin(), payload.end(), result.begin() + 54);
  return result;
}

ParsedPacketTree parse(PacketParser &parser,
                       const std::vector<std::byte> &packet,
                       std::uint64_t packet_id = 1) {
  return parser.parse(pruftnet::sniffing::RawPacketView{
      .metadata =
          {
              .key =
                  {
                      .capture_id = {.high = 1, .low = 2},
                      .packet_id = packet_id,
                  },
              .captured_len = static_cast<std::uint32_t>(packet.size()),
              .wire_len = static_cast<std::uint32_t>(packet.size()),
              .link_type = 1,
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

void client_and_server_hellos_expose_negotiation_fields() {
  const auto registry = core_registry();
  PacketParser parser(registry);
  const auto client = tls_record(22, client_hello(), 0x0301);
  const auto client_tree = parse(parser, tcp_packet(client));

  assert(client_tree.condition() == ParseCondition::Complete);
  assert(node_count(client_tree, *registry, "tls.record") == 1);
  assert(node(client_tree, *registry, "tls.handshake.type").value_low == 1);
  assert(client_tree.node_text(
             node(client_tree, *registry, "tls.handshake.server_name")) ==
         "example.com");
  assert(client_tree.node_text(
             node(client_tree, *registry, "tls.handshake.alpn")) == "h2");
  assert((values(client_tree, *registry, "tls.handshake.cipher_suite") ==
          std::vector<std::uint64_t>{0x1301, 0xc02f}));
  assert((values(client_tree, *registry, "tls.handshake.supported_version") ==
          std::vector<std::uint64_t>{0x0304, 0x0303}));
  assert((values(client_tree, *registry, "tls.handshake.supported_group") ==
          std::vector<std::uint64_t>{0x001d, 0x0017}));

  PacketParser server_parser(registry);
  const auto server = tls_record(22, server_hello());
  const auto server_tree =
      parse(server_parser, tcp_packet(server, 0, 0x18, 443, 50'000));
  assert(server_tree.condition() == ParseCondition::Complete);
  assert(node(server_tree, *registry, "tls.handshake.type").value_low == 2);
  assert(node(server_tree, *registry, "tls.handshake.cipher_suite").value_low ==
         0x1301);
  assert(node(server_tree, *registry, "tls.handshake.supported_version")
             .value_low == 0x0304);
}

void tcp_and_handshake_record_boundaries_are_reassembled() {
  const auto registry = core_registry();
  PacketParser parser(registry);
  const auto record = tls_record(22, client_hello());
  constexpr std::size_t split = 17;
  const auto first =
      parse(parser, tcp_packet(std::span(record).first(split), 1'000), 1);
  assert(first.condition() == ParseCondition::Complete);
  assert(node_count(first, *registry, "tls.handshake") == 0);

  const auto second =
      parse(parser,
            tcp_packet(std::span(record).subspan(split),
                       1'000 + static_cast<std::uint32_t>(split)),
            2);
  assert(second.condition() == ParseCondition::Complete);
  assert(node(second, *registry, "tcp.reassembled_segment_count").value_low ==
         2);
  assert(node(second, *registry, "tls.handshake.type").value_low == 1);

  PacketParser record_parser(registry);
  const auto hello = client_hello();
  constexpr std::size_t handshake_split = 31;
  const auto first_record =
      tls_record(22, std::span(hello).first(handshake_split));
  const auto second_record =
      tls_record(22, std::span(hello).subspan(handshake_split));
  const auto partial = parse(record_parser, tcp_packet(first_record, 5'000), 3);
  assert(partial.condition() == ParseCondition::Complete);
  assert(node_count(partial, *registry, "tls.handshake") == 0);

  const auto complete =
      parse(record_parser,
            tcp_packet(second_record,
                       5'000 + static_cast<std::uint32_t>(first_record.size())),
            4);
  assert(complete.condition() == ParseCondition::Complete);
  assert(node(complete, *registry, "tls.handshake.reassembled").value_low == 1);
  assert(complete.data_sources().size() == 3);
  assert(complete.source_name(complete.data_sources()[2]) ==
         "Reassembled TLS handshake");
  assert(complete.source_contributors(complete.data_sources()[2]).size() == 2);
}

void alerts_heartbeats_and_ciphertext_state_are_bounded() {
  const auto registry = core_registry();
  PacketParser parser(registry);
  const std::vector alert_payload{std::byte{2}, std::byte{40}};
  const std::vector heartbeat_payload{
      std::byte{1},   std::byte{0},   std::byte{3}, std::byte{'a'},
      std::byte{'b'}, std::byte{'c'}, std::byte{0}};
  auto payload = tls_record(21, alert_payload);
  append(payload, tls_record(24, heartbeat_payload));
  const auto tree = parse(parser, tcp_packet(payload));

  assert(tree.condition() == ParseCondition::Complete);
  assert(node(tree, *registry, "tls.alert.level").value_low == 2);
  assert(node(tree, *registry, "tls.alert.description").value_low == 40);
  assert(node(tree, *registry, "tls.heartbeat.length").value_low == 3);
  const auto heartbeat =
      tree.node_bytes(node(tree, *registry, "tls.heartbeat.payload"));
  assert(heartbeat.size() == 3);
  assert(heartbeat[0] == std::byte{'a'});

  PacketParser encrypted_parser(registry);
  const std::vector ccs_payload{std::byte{1}};
  const auto ccs = tls_record(20, ccs_payload);
  const auto ccs_tree = parse(encrypted_parser, tcp_packet(ccs, 10'000), 2);
  assert(ccs_tree.condition() == ParseCondition::Complete);
  assert(node(ccs_tree, *registry, "tls.change_cipher_spec").value_low == 1);

  const std::vector encrypted_finished{std::byte{0x14}, std::byte{0xff},
                                       std::byte{0xff}, std::byte{0xff},
                                       std::byte{0x7a}, std::byte{0x91}};
  const auto encrypted_record = tls_record(22, encrypted_finished);
  const auto encrypted_tree =
      parse(encrypted_parser,
            tcp_packet(encrypted_record,
                       10'000 + static_cast<std::uint32_t>(ccs.size())),
            3);
  assert(encrypted_tree.condition() == ParseCondition::Complete);
  assert(node_count(encrypted_tree, *registry, "tls.record") == 1);
  assert(node_count(encrypted_tree, *registry, "tls.handshake") == 0);
}

void invalid_record_headers_and_plaintext_structures_are_malformed() {
  const auto registry = core_registry();

  PacketParser version_parser(registry);
  const std::vector invalid_version{std::byte{22}, std::byte{0x02},
                                    std::byte{0x00}, std::byte{0},
                                    std::byte{0}};
  assert(parse(version_parser, tcp_packet(invalid_version)).condition() ==
         ParseCondition::Malformed);

  PacketParser length_parser(registry);
  const std::vector excessive_length{std::byte{22}, std::byte{0x03},
                                     std::byte{0x03}, std::byte{0x41},
                                     std::byte{0x01}};
  assert(parse(length_parser, tcp_packet(excessive_length)).condition() ==
         ParseCondition::Malformed);

  PacketParser heartbeat_parser(registry);
  const std::vector invalid_heartbeat{std::byte{1}, std::byte{0}, std::byte{4},
                                      std::byte{'x'}};
  assert(parse(heartbeat_parser, tcp_packet(tls_record(24, invalid_heartbeat)))
             .condition() == ParseCondition::Malformed);

  PacketParser ccs_parser(registry);
  const std::vector invalid_ccs{std::byte{2}};
  assert(
      parse(ccs_parser, tcp_packet(tls_record(20, invalid_ccs))).condition() ==
      ParseCondition::Malformed);
}

} // namespace

int main() {
  client_and_server_hellos_expose_negotiation_fields();
  tcp_and_handshake_record_boundaries_are_reassembled();
  alerts_heartbeats_and_ciphertext_state_are_bounded();
  invalid_record_headers_and_plaintext_structures_are_malformed();
}

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

std::vector<std::byte> bytes(std::string_view value) {
  std::vector<std::byte> result;
  result.reserve(value.size());
  for (const auto character : value) {
    result.push_back(
        static_cast<std::byte>(static_cast<unsigned char>(character)));
  }
  return result;
}

std::vector<std::byte> tcp_packet(std::span<const std::byte> payload,
                                  std::uint32_t sequence = 0,
                                  std::uint8_t flags = 0x18,
                                  std::uint16_t source_port = 50'000,
                                  std::uint16_t destination_port = 80) {
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

void requests_expose_start_line_headers_and_content_length_body() {
  const auto registry = core_registry();
  PacketParser parser(registry);
  const auto message = bytes("POST /submit HTTP/1.1\r\n"
                             "Host: example.com\r\n"
                             "User-Agent: pruftnet-test\r\n"
                             "Content-Type: text/plain\r\n"
                             "Content-Length: 4\r\n"
                             "\r\n"
                             "test");
  const auto tree = parse(parser, tcp_packet(message));

  assert(tree.condition() == ParseCondition::Complete);
  assert(node_count(tree, *registry, "http.message") == 1);
  assert(node(tree, *registry, "http.request").value_low == 1);
  assert(tree.node_text(node(tree, *registry, "http.method")) == "POST");
  assert(tree.node_text(node(tree, *registry, "http.request_target")) ==
         "/submit");
  assert(tree.node_text(node(tree, *registry, "http.host")) == "example.com");
  assert(tree.node_text(node(tree, *registry, "http.user_agent")) ==
         "pruftnet-test");
  assert(node(tree, *registry, "http.content_length").value_low == 4);
  const auto body = tree.node_bytes(node(tree, *registry, "http.body"));
  assert(body.size() == 4);
  assert(std::equal(body.begin(), body.end(), message.end() - 4));
  assert(node_count(tree, *registry, "tcp.payload") == 0);
}

void chunked_responses_include_extensions_data_and_trailers() {
  const auto registry = core_registry();
  PacketParser parser(registry);
  const auto message = bytes("HTTP/1.1 200 OK\r\n"
                             "Transfer-Encoding: chunked\r\n"
                             "\r\n"
                             "4;foo=bar\r\n"
                             "test\r\n"
                             "0\r\n"
                             "X-End: yes\r\n"
                             "\r\n");
  const auto tree = parse(parser, tcp_packet(message));

  assert(tree.condition() == ParseCondition::Complete);
  assert(node(tree, *registry, "http.response").value_low == 1);
  assert(node(tree, *registry, "http.status_code").value_low == 200);
  assert(tree.node_text(node(tree, *registry, "http.reason_phrase")) == "OK");
  assert(node_count(tree, *registry, "http.chunk") == 2);
  assert(node_count(tree, *registry, "http.header") == 2);
  assert(tree.node_text(node(tree, *registry, "http.chunk.extension")) ==
         "foo=bar");
  const auto data = tree.node_bytes(node(tree, *registry, "http.chunk.data"));
  assert(data.size() == 4);
  assert(data[0] == std::byte{'t'});

  const auto size_id = field_id(*registry, "http.chunk.size");
  std::vector<std::uint64_t> sizes;
  for (const auto &candidate : tree.nodes()) {
    if (candidate.field_id == size_id) {
      sizes.push_back(candidate.value_low);
    }
  }
  assert((sizes == std::vector<std::uint64_t>{4, 0}));
}

void split_and_pipelined_messages_use_tcp_stream_framing() {
  const auto registry = core_registry();
  PacketParser parser(registry);
  const auto message =
      bytes("GET /split HTTP/1.1\r\nHost: example.com\r\n\r\n");
  constexpr std::size_t split = 19;
  const auto first_packet = tcp_packet(std::span(message).first(split), 1'000);
  const auto second_packet =
      tcp_packet(std::span(message).subspan(split),
                 1'000 + static_cast<std::uint32_t>(split));

  const auto first = parse(parser, first_packet, 1);
  assert(first.condition() == ParseCondition::Complete);
  assert(node_count(first, *registry, "http.body") == 0);

  const auto second = parse(parser, second_packet, 2);
  assert(second.condition() == ParseCondition::Complete);
  assert(second.node_text(node(second, *registry, "http.request_target")) ==
         "/split");
  assert(node(second, *registry, "tcp.reassembled_segment_count").value_low ==
         2);
  assert(second.source_contributors(second.data_sources()[1]).size() == 2);

  const auto pipelined =
      bytes("GET /one HTTP/1.1\r\nHost: example.com\r\n\r\n"
            "GET /two HTTP/1.1\r\nHost: example.com\r\n\r\n");
  const auto pipeline_tree = parse(parser, tcp_packet(pipelined), 3);
  assert(pipeline_tree.condition() == ParseCondition::Complete);
  assert(node_count(pipeline_tree, *registry, "http.message") == 2);
  assert(node_count(pipeline_tree, *registry, "http.request_target") == 2);
}

void ambiguous_framing_and_invalid_lines_are_malformed() {
  const auto registry = core_registry();
  PacketParser parser(registry);
  const auto conflicting = bytes("POST / HTTP/1.1\r\n"
                                 "Host: example.com\r\n"
                                 "Content-Length: 3\r\n"
                                 "Content-Length: 4\r\n"
                                 "\r\n"
                                 "test");
  assert(parse(parser, tcp_packet(conflicting)).condition() ==
         ParseCondition::Malformed);

  const auto smuggling = bytes("POST / HTTP/1.1\r\n"
                               "Host: example.com\r\n"
                               "Transfer-Encoding: chunked\r\n"
                               "Content-Length: 4\r\n"
                               "\r\n"
                               "0\r\n\r\n");
  assert(parse(parser, tcp_packet(smuggling), 2).condition() ==
         ParseCondition::Malformed);

  const auto bare_cr = bytes("GET / HTTP/1.1\rX-Bad: value\n\n");
  assert(parse(parser, tcp_packet(bare_cr), 3).condition() ==
         ParseCondition::Malformed);
}

void close_delimited_response_completes_when_tcp_ends() {
  const auto registry = core_registry();
  PacketParser parser(registry);
  const auto response =
      bytes("HTTP/1.0 200 OK\r\nContent-Type: text/plain\r\n\r\nhello");
  const auto tree = parse(parser, tcp_packet(response, 0, 0x11));

  assert(tree.condition() == ParseCondition::Complete);
  assert(node(tree, *registry, "http.status_code").value_low == 200);
  const auto body = tree.node_bytes(node(tree, *registry, "http.body"));
  assert(body.size() == 5);
  assert(body[0] == std::byte{'h'});
}

} // namespace

int main() {
  requests_expose_start_line_headers_and_content_length_body();
  chunked_responses_include_extensions_data_and_trailers();
  split_and_pipelined_messages_use_tcp_stream_framing();
  ambiguous_framing_and_invalid_lines_are_malformed();
  close_delimited_response_completes_when_tcp_ends();
}

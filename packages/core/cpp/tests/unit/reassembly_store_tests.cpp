#include <algorithm>
#include <array>
#include <cassert>
#include <cstddef>
#include <cstdint>
#include <span>

#include "parsing/reassembly_store.hpp"

namespace {

using namespace pruftnet::parsing;
using namespace pruftnet::parsing::internal;
namespace sniffing = pruftnet::sniffing;

constexpr sniffing::CaptureId kCapture{1, 2};

sniffing::PacketMetadata metadata(std::uint64_t packet_id,
                                  sniffing::CaptureId capture = kCapture) {
  return sniffing::PacketMetadata{
      .key = {.capture_id = capture, .packet_id = packet_id},
      .interface_id = 3,
  };
}

NetworkLayerContext network(IpFamily family = IpFamily::V4) {
  NetworkLayerContext result;
  result.family = family;
  result.address_length = family == IpFamily::V4 ? 4 : 16;
  result.source[0] = std::byte{192};
  result.source[1] = std::byte{0};
  result.source[2] = std::byte{2};
  result.source[3] = std::byte{1};
  result.destination[0] = std::byte{198};
  result.destination[1] = std::byte{51};
  result.destination[2] = std::byte{100};
  result.destination[3] = std::byte{2};
  return result;
}

ParsedContributor contributor(std::uint64_t packet_id, std::size_t length,
                              std::uint32_t source_offset = 40) {
  return ParsedContributor{
      .packet_key = {.capture_id = kCapture, .packet_id = packet_id},
      .source_offset = source_offset,
      .source_length = static_cast<std::uint32_t>(length),
      .destination_offset = 0,
      .destination_length = static_cast<std::uint32_t>(length),
  };
}

template <std::size_t Size>
IpFragmentInput fragment(const std::array<std::byte, Size> &bytes,
                         const ParsedContributor &source, std::size_t offset,
                         bool more, IpFamily family = IpFamily::V4) {
  return IpFragmentInput{
      .network = network(family),
      .protocol = 17,
      .identification = 0x1234,
      .interface_id = 3,
      .offset = offset,
      .more_fragments = more,
      .bytes = bytes,
      .contributors = std::span(&source, 1),
  };
}

template <std::size_t Size>
TcpSegmentInput segment(const std::array<std::byte, Size> &bytes,
                        const ParsedContributor &source,
                        std::uint32_t sequence) {
  return TcpSegmentInput{
      .network = network(),
      .source_port = 50'000,
      .destination_port = 80,
      .interface_id = 3,
      .sequence = sequence,
      .bytes = bytes,
      .contributors = std::span(&source, 1),
  };
}

void ip_fragments_reassemble_out_of_order_with_provenance() {
  ReassemblyStore store;
  constexpr std::array first{
      std::byte{0}, std::byte{1}, std::byte{2}, std::byte{3},
      std::byte{4}, std::byte{5}, std::byte{6}, std::byte{7},
  };
  constexpr std::array last{
      std::byte{8},
      std::byte{9},
      std::byte{10},
      std::byte{11},
  };
  const auto first_source = contributor(1, first.size());
  const auto last_source = contributor(2, last.size(), 48);

  store.begin_packet(metadata(2));
  const auto pending =
      store.submit_ip_fragment(fragment(last, last_source, 8, false));
  assert(pending.status == ReassemblyStatus::Incomplete);
  assert(store.ip_datagram_count() == 1);

  store.begin_packet(metadata(1));
  const auto complete =
      store.submit_ip_fragment(fragment(first, first_source, 0, true));
  assert(complete.status == ReassemblyStatus::Complete);
  assert(complete.bytes.size() == 12);
  assert(std::equal(first.begin(), first.end(), complete.bytes.begin()));
  assert(std::equal(last.begin(), last.end(), complete.bytes.begin() + 8));
  assert(complete.contributors.size() == 2);
  assert(std::any_of(complete.contributors.begin(), complete.contributors.end(),
                     [](const auto &item) {
                       return item.packet_key.packet_id == 1 &&
                              item.destination_offset == 0 &&
                              item.destination_length == 8;
                     }));
  assert(std::any_of(complete.contributors.begin(), complete.contributors.end(),
                     [](const auto &item) {
                       return item.packet_key.packet_id == 2 &&
                              item.destination_offset == 8 &&
                              item.destination_length == 4;
                     }));
  assert(store.ip_datagram_count() == 0);
  assert(store.buffered_bytes() == 0);
}

void ip_overlap_policy_is_family_specific_and_conflicts_are_rejected() {
  ReassemblyStore store;
  constexpr std::array bytes{
      std::byte{0}, std::byte{1}, std::byte{2}, std::byte{3},
      std::byte{4}, std::byte{5}, std::byte{6}, std::byte{7},
  };
  auto conflicting = bytes;
  conflicting[3] = std::byte{0xff};
  const auto source1 = contributor(1, bytes.size());
  const auto source2 = contributor(2, bytes.size());

  store.begin_packet(metadata(1));
  assert(store.submit_ip_fragment(fragment(bytes, source1, 0, true)).status ==
         ReassemblyStatus::Incomplete);
  store.begin_packet(metadata(2));
  const auto duplicate =
      store.submit_ip_fragment(fragment(bytes, source2, 0, true));
  assert(duplicate.status == ReassemblyStatus::Overlap);
  assert(store.ip_datagram_count() == 1);

  store.begin_packet(metadata(3));
  const auto conflict =
      store.submit_ip_fragment(fragment(conflicting, source2, 0, true));
  assert(conflict.status == ReassemblyStatus::Conflict);
  assert(store.ip_datagram_count() == 0);

  store.begin_packet(metadata(4));
  assert(
      store.submit_ip_fragment(fragment(bytes, source1, 0, true, IpFamily::V6))
          .status == ReassemblyStatus::Incomplete);
  store.begin_packet(metadata(5));
  const auto ipv6_overlap =
      store.submit_ip_fragment(fragment(bytes, source2, 0, true, IpFamily::V6));
  assert(ipv6_overlap.status == ReassemblyStatus::Overlap);
  assert(store.ip_datagram_count() == 0);
}

void tcp_streams_fill_gaps_preserve_suffixes_and_handle_retransmissions() {
  ReassemblyStore store;
  constexpr std::array first{std::byte{'h'}, std::byte{'e'}, std::byte{'l'}};
  constexpr std::array middle{std::byte{'l'}, std::byte{'o'}, std::byte{' '}};
  constexpr std::array last{
      std::byte{'w'}, std::byte{'o'}, std::byte{'r'},
      std::byte{'l'}, std::byte{'d'},
  };
  const auto first_source = contributor(1, first.size(), 54);
  const auto middle_source = contributor(2, middle.size(), 54);
  const auto last_source = contributor(3, last.size(), 54);

  store.begin_packet(metadata(1));
  auto chunk = store.submit_tcp_segment(segment(first, first_source, 100));
  assert(chunk.bytes.size() == 3);

  store.begin_packet(metadata(3));
  chunk = store.submit_tcp_segment(segment(last, last_source, 106));
  assert(chunk.bytes.size() == 3);

  store.begin_packet(metadata(2));
  chunk = store.submit_tcp_segment(segment(middle, middle_source, 103));
  assert(chunk.status == ReassemblyStatus::Complete);
  assert(chunk.bytes.size() == 11);
  constexpr std::array expected{
      std::byte{'h'}, std::byte{'e'}, std::byte{'l'}, std::byte{'l'},
      std::byte{'o'}, std::byte{' '}, std::byte{'w'}, std::byte{'o'},
      std::byte{'r'}, std::byte{'l'}, std::byte{'d'},
  };
  assert(std::equal(expected.begin(), expected.end(), chunk.bytes.begin()));
  assert(store.consume_tcp(segment(middle, middle_source, 103), 6));

  store.begin_packet(metadata(4));
  chunk = store.submit_tcp_segment(segment(last, last_source, 106));
  assert(chunk.status == ReassemblyStatus::Overlap);
  assert(chunk.bytes.size() == 5);
  assert(std::equal(last.begin(), last.end(), chunk.bytes.begin()));
  assert(store.consume_tcp(segment(last, last_source, 106), 5));
  assert(store.tcp_flow_count() == 0);
  assert(store.buffered_bytes() == 0);
}

void limits_and_capture_changes_evict_state_without_cross_capture_mixing() {
  ReassemblyBudget budget;
  budget.max_buffered_bytes = 256;
  budget.max_tcp_bytes_per_flow = 8;
  ReassemblyStore store(budget);
  constexpr std::array bytes{
      std::byte{0}, std::byte{1}, std::byte{2}, std::byte{3},
      std::byte{4}, std::byte{5}, std::byte{6}, std::byte{7},
  };
  const auto source = contributor(1, bytes.size());

  store.begin_packet(metadata(1));
  assert(store.submit_ip_fragment(fragment(bytes, source, 0, true)).status ==
         ReassemblyStatus::Incomplete);
  assert(store.ip_datagram_count() == 1);

  store.begin_packet(metadata(1, sniffing::CaptureId{9, 9}));
  assert(store.ip_datagram_count() == 0);
  assert(store.buffered_bytes() == 0);

  store.begin_packet(metadata(2, sniffing::CaptureId{9, 9}));
  const auto too_large = store.submit_tcp_segment(segment(bytes, source, 100));
  assert(too_large.bytes.size() == bytes.size());
  constexpr std::array extra{std::byte{8}};
  const auto extra_source = contributor(2, extra.size());
  store.begin_packet(metadata(3, sniffing::CaptureId{9, 9}));
  assert(store.submit_tcp_segment(segment(extra, extra_source, 108)).status ==
         ReassemblyStatus::ResourceLimit);
  assert(store.tcp_flow_count() == 0);
}

} // namespace

int main() {
  ip_fragments_reassemble_out_of_order_with_provenance();
  ip_overlap_policy_is_family_specific_and_conflicts_are_rejected();
  tcp_streams_fill_gaps_preserve_suffixes_and_handle_retransmissions();
  limits_and_capture_changes_evict_state_without_cross_capture_mixing();
}

#pragma once

#include <cstddef>
#include <cstdint>
#include <memory>
#include <span>
#include <vector>

#include "parsing/network_types.hpp"
#include "pruftnet/parsing/parsed_tree.hpp"
#include "pruftnet/sniffing/packet.hpp"

namespace pruftnet::parsing::internal {

struct ReassemblyBudget {
  std::size_t max_ip_datagrams = 2'048;
  std::size_t max_tcp_flows = 4'096;
  std::size_t max_buffered_bytes = 64U << 20U;
  std::size_t max_ip_fragments_per_datagram = 256;
  std::size_t max_tcp_segments_per_flow = 4'096;
  std::size_t max_contributors_per_item = 4'096;
  std::size_t max_tcp_bytes_per_flow = 4U << 20U;
  std::size_t max_idle_packets = 65'536;
};

enum class ReassemblyStatus : std::uint8_t {
  Incomplete,
  Complete,
  Duplicate,
  Overlap,
  Conflict,
  ResourceLimit,
  Invalid,
};

struct ReassembledPayload {
  ReassemblyStatus status = ReassemblyStatus::Incomplete;
  std::vector<std::byte> bytes;
  std::vector<ParsedContributor> contributors;
  std::size_t part_count = 0;
  bool overlap = false;
  bool conflict = false;
};

struct IpFragmentInput {
  NetworkLayerContext network;
  std::uint8_t protocol = 0;
  std::uint32_t identification = 0;
  std::uint32_t interface_id = 0;
  std::size_t offset = 0;
  bool more_fragments = false;
  std::span<const std::byte> bytes;
  std::span<const ParsedContributor> contributors;
};

struct TcpSegmentInput {
  NetworkLayerContext network;
  std::uint16_t source_port = 0;
  std::uint16_t destination_port = 0;
  std::uint32_t interface_id = 0;
  std::uint32_t sequence = 0;
  bool syn = false;
  std::span<const std::byte> bytes;
  std::span<const ParsedContributor> contributors;
};

class ReassemblyStore {
public:
  explicit ReassemblyStore(ReassemblyBudget budget = {});
  ~ReassemblyStore();

  ReassemblyStore(const ReassemblyStore &) = delete;
  ReassemblyStore &operator=(const ReassemblyStore &) = delete;
  ReassemblyStore(ReassemblyStore &&) noexcept;
  ReassemblyStore &operator=(ReassemblyStore &&) noexcept;

  void begin_packet(const sniffing::PacketMetadata &metadata);
  void clear() noexcept;

  [[nodiscard]] ReassembledPayload
  submit_ip_fragment(const IpFragmentInput &input);
  [[nodiscard]] ReassembledPayload
  submit_tcp_segment(const TcpSegmentInput &input);
  [[nodiscard]] bool consume_tcp(const TcpSegmentInput &input,
                                 std::size_t length);
  [[nodiscard]] std::uint64_t
  tcp_application_state(const TcpSegmentInput &input) const noexcept;
  [[nodiscard]] bool set_tcp_application_state(const TcpSegmentInput &input,
                                               std::uint64_t state);
  void close_tcp(const TcpSegmentInput &input) noexcept;

  [[nodiscard]] std::size_t ip_datagram_count() const noexcept;
  [[nodiscard]] std::size_t tcp_flow_count() const noexcept;
  [[nodiscard]] std::size_t buffered_bytes() const noexcept;

private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};

} // namespace pruftnet::parsing::internal

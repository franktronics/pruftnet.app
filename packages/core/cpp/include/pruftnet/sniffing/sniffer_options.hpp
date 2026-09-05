#pragma once

#include <chrono>
#include <cstddef>
#include <cstdint>
#include <limits>
#include <optional>
#include <string>
#include <vector>

#include "pruftnet/sniffing/packet.hpp"

namespace pruftnet::sniffing {

std::vector<int> default_supported_link_types();

inline constexpr std::uint32_t kAutoInterfaceId =
    std::numeric_limits<std::uint32_t>::max();
inline constexpr std::size_t kMaxCaptureInterfaces = 256;
inline constexpr int kMaxSnapshotLength = 262'144;
inline constexpr int kMaxPcapBufferSizeBytes = 1'073'741'824;
inline constexpr int kMaxReadTimeoutMs = 86'400'000;
inline constexpr int kMaxPcapDispatchBatchSize = 65'536;
inline constexpr std::size_t kMaxRingSlots = 16'777'216;

struct SnifferInterfaceOptions {
  std::string name;
  std::uint32_t id = kAutoInterfaceId;
  bool promiscuous = false;
  bool monitor_mode = false;
  int snaplen = 512;
  int pcap_buffer_size_bytes = 64 * 1024 * 1024;
  int read_timeout_ms = 10;
  int pcap_dispatch_batch_size = 64;
  std::size_t ring_slots = 65'536;
  std::size_t ring_bytes = 16 * 1024 * 1024;
  std::string bpf_filter;
  bool bpf_optimize = true;
  std::optional<int> requested_link_type;
  std::optional<std::string> timestamp_type;
};

struct SnifferOptions {
  SnifferOptions();

  std::vector<SnifferInterfaceOptions> interfaces;
  std::optional<CaptureId> capture_id;
  std::vector<int> accepted_link_types;
  std::chrono::milliseconds stats_poll_interval =
      std::chrono::milliseconds(1'000);
  std::size_t max_total_ring_bytes = 0;
  std::string spool_directory;
  std::uint64_t spool_max_total_bytes = 0;
  std::uint64_t spool_segment_bytes = 0;
  std::size_t spool_max_segments = 0;
  bool spool_ring_mode = false;
  bool spool_temporary = true;
  std::chrono::milliseconds spool_flush_interval =
      std::chrono::milliseconds(8);
  std::size_t spool_flush_bytes = 1024 * 1024;
};

} // namespace pruftnet::sniffing

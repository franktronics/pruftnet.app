#pragma once

#include <chrono>
#include <cstddef>
#include <cstdint>
#include <filesystem>
#include <functional>
#include <memory>
#include <mutex>
#include <optional>
#include <span>
#include <string>
#include <unordered_map>
#include <variant>
#include <vector>

#include "pruftnet/sniffing/packet.hpp"

namespace pruftnet::capture {

struct SpoolInterface {
  std::uint32_t interface_id = 0;
  std::string name;
  std::uint16_t link_type = 0;
  std::uint32_t snaplen = 0;
  std::uint8_t timestamp_resolution = 9;
};

struct PcapngSpoolOptions {
  std::filesystem::path directory;
  std::string file_prefix = "capture";
  std::uint64_t max_total_bytes = 0;
  std::uint64_t segment_bytes = 0;
  std::size_t max_segments = 0;
  bool ring_mode = false;
  bool temporary = true;
  std::chrono::milliseconds flush_interval{50};
  std::size_t flush_bytes = 1024 * 1024;
};

enum class SpoolFailureReason {
  DirectoryUnavailable,
  OpenFailed,
  ShortWrite,
  WriteFailed,
  FlushFailed,
  FinalizeFailed,
  QuotaExceeded,
  InvalidPacket,
  CorruptData,
};

struct SpoolError {
  SpoolFailureReason reason = SpoolFailureReason::WriteFailed;
  std::string message;
  int system_error = 0;
};

struct CommittedPacket {
  sniffing::PacketMetadata metadata;
  std::uint64_t ordinal = 0;
  std::uint64_t segment_id = 0;
  std::uint64_t block_offset = 0;
  std::uint64_t data_offset = 0;
  std::uint32_t block_length = 0;
};

enum class PacketSpoolLookupStatus {
  Found,
  Evicted,
  NotFound,
  Corrupt,
};

struct PersistedPacket {
  sniffing::PacketMetadata metadata;
  std::vector<std::byte> bytes;
};

struct PacketSpoolLookup {
  PacketSpoolLookupStatus status = PacketSpoolLookupStatus::NotFound;
  std::optional<PersistedPacket> packet;
};

struct PcapngSpoolStats {
  std::uint64_t packets_persisted = 0;
  std::uint64_t bytes_written = 0;
  std::uint64_t bytes_retained = 0;
  std::uint64_t quota_bytes = 0;
  std::uint64_t evicted_packets = 0;
  std::uint64_t evicted_bytes = 0;
  std::uint64_t write_failures = 0;
  std::uint64_t flush_failures = 0;
  std::uint64_t last_committed_packet_id = 0;
  std::uint64_t pending_packets = 0;
  std::uint64_t pending_bytes = 0;
  std::size_t segments = 0;
};

struct PcapngSegmentSnapshot {
  std::uint64_t id = 0;
  std::filesystem::path path;
  std::uint64_t committed_bytes = 0;
  std::uint64_t committed_packets = 0;
  std::uint64_t first_packet_id = 0;
  std::uint64_t last_packet_id = 0;
  bool evicted = false;
};

class SpoolSink {
public:
  virtual ~SpoolSink() = default;
  virtual std::size_t write(std::span<const std::byte> bytes) noexcept = 0;
  virtual bool flush() noexcept = 0;
  virtual bool close() noexcept = 0;
  [[nodiscard]] virtual int last_error() const noexcept = 0;
};

using SpoolSinkFactory = std::function<std::unique_ptr<SpoolSink>(
    const std::filesystem::path &, SpoolError &)>;

class PcapngSpool {
public:
  static std::variant<std::unique_ptr<PcapngSpool>, SpoolError>
  create(PcapngSpoolOptions options, sniffing::CaptureId capture_id,
         std::vector<SpoolInterface> interfaces,
         SpoolSinkFactory sink_factory = {});

  ~PcapngSpool();
  PcapngSpool(const PcapngSpool &) = delete;
  PcapngSpool &operator=(const PcapngSpool &) = delete;

  std::optional<SpoolError> append(const sniffing::PacketMetadata &metadata,
                                   std::span<const std::byte> bytes) noexcept;
  std::variant<std::vector<CommittedPacket>, SpoolError> flush() noexcept;
  std::variant<std::vector<CommittedPacket>, SpoolError>
  flush_if_due() noexcept;
  std::variant<std::vector<CommittedPacket>, SpoolError> finalize() noexcept;

  [[nodiscard]] PacketSpoolLookup lookup(const sniffing::PacketKey &key) const;
  [[nodiscard]] PacketSpoolLookup lookup_ordinal(std::uint64_t ordinal) const;
  [[nodiscard]] std::optional<CommittedPacket>
  committed_packet(std::uint64_t ordinal) const;
  [[nodiscard]] std::uint64_t committed_count() const noexcept;
  [[nodiscard]] PcapngSpoolStats stats() const noexcept;
  [[nodiscard]] std::vector<std::filesystem::path> segment_paths() const;
  [[nodiscard]] std::vector<PcapngSegmentSnapshot> segment_snapshots() const;
  [[nodiscard]] std::vector<PcapngSegmentSnapshot> lease_snapshot();
  void release_leases(std::span<const std::uint64_t> segment_ids) noexcept;

  struct RecoveryResult {
    sniffing::CaptureId capture_id{};
    std::uint64_t valid_bytes = 0;
    std::uint64_t truncated_bytes = 0;
    std::vector<CommittedPacket> packets;
  };

  static std::variant<RecoveryResult, SpoolError>
  recover_segment(const std::filesystem::path &path,
                  bool truncate_partial_tail);

private:
  PcapngSpool(PcapngSpoolOptions options, sniffing::CaptureId capture_id,
              std::vector<SpoolInterface> interfaces,
              SpoolSinkFactory sink_factory);

  struct IndexEntry;
  struct Segment;

  std::optional<SpoolError> open_segment() noexcept;
  std::optional<SpoolError>
  rotate_if_needed(std::size_t next_block_bytes) noexcept;
  std::optional<SpoolError>
  write_block(std::span<const std::byte> block) noexcept;
  std::optional<SpoolError>
  enforce_retention(std::size_t incoming_bytes) noexcept;
  std::optional<SpoolError> evict_oldest_segment() noexcept;
  std::variant<std::vector<CommittedPacket>, SpoolError>
  flush_locked() noexcept;

  PcapngSpoolOptions options_;
  sniffing::CaptureId capture_id_;
  std::vector<SpoolInterface> interfaces_;
  SpoolSinkFactory sink_factory_;
  mutable std::mutex mutex_;
  std::unique_ptr<SpoolSink> sink_;
  std::vector<Segment> segments_;
  std::vector<IndexEntry> index_;
  std::unordered_map<sniffing::PacketId, std::size_t> packet_index_;
  std::vector<std::size_t> pending_indices_;
  std::vector<CommittedPacket> deferred_committed_;
  std::uint64_t next_segment_id_ = 1;
  std::uint64_t current_offset_ = 0;
  std::uint64_t bytes_written_ = 0;
  std::uint64_t bytes_retained_ = 0;
  std::uint64_t evicted_packets_ = 0;
  std::uint64_t evicted_bytes_ = 0;
  std::uint64_t write_failures_ = 0;
  std::uint64_t flush_failures_ = 0;
  std::uint64_t last_committed_packet_id_ = 0;
  std::uint64_t pending_bytes_ = 0;
  std::chrono::steady_clock::time_point last_flush_{};
  bool finalized_ = false;
  bool preserve_on_destroy_ = false;
};

std::string to_string(SpoolFailureReason reason);

} // namespace pruftnet::capture

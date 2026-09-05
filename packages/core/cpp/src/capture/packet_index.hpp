#pragma once

#include <memory>
#include <stop_token>

#include "pruftnet/capture/pcapng_spool.hpp"

namespace pruftnet::capture::internal {

// Derived, disposable storage. Writes never fail the capture. Each sorted run
// holds at most 4096 offsets, including when rebuilding an unsegmented capture.
class PacketIndexWriter {
public:
  PacketIndexWriter(const std::filesystem::path &source,
                    sniffing::CaptureId capture_id) noexcept;
  ~PacketIndexWriter();
  void append(const CommittedPacket &packet) noexcept;
  bool finish() noexcept;

private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};

// A best-effort bounded producer for live analysis. Saturation abandons the
// current segment's derived index rather than blocking capture or analysis.
class AsyncPacketIndexWriter {
public:
  AsyncPacketIndexWriter() noexcept;
  ~AsyncPacketIndexWriter();
  void segment(std::optional<std::filesystem::path> source,
               sniffing::CaptureId capture_id) noexcept;
  void append(const CommittedPacket &packet) noexcept;
  void finish() noexcept;

private:
  struct Impl;
  std::unique_ptr<Impl> impl_;
};

std::filesystem::path packet_index_path(const std::filesystem::path &source);

// Missing/stale/corrupt indexes are rebuilt with bounded memory. A cancelled
// reconstruction removes its incomplete artifact and never edits raw data.
std::variant<PacketSpoolLookup, SpoolError>
read_indexed_packet(const std::filesystem::path &source,
                    const sniffing::PacketKey &key, std::stop_token stop = {});

} // namespace pruftnet::capture::internal

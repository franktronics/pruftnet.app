#pragma once

#include <atomic>
#include <cstddef>
#include <cstdint>
#include <deque>
#include <mutex>
#include <optional>
#include <string>
#include <unordered_map>
#include <vector>

#include "pruftnet/parsing/parsed_tree.hpp"
#include "pruftnet/parsing/summary_extractor.hpp"
#include "pruftnet/sniffing/packet.hpp"
#include "pruftnet/sniffing/sniffer_event.hpp"

namespace pruftnet::replay {

struct PacketKeyHash {
  std::size_t operator()(const sniffing::PacketKey &key) const noexcept;
};

struct RetainedPacket {
  sniffing::PacketMetadata metadata;
  std::vector<std::byte> bytes;
};

enum class PacketLookup { Found, Evicted, Unknown };

struct PacketLookupResult {
  PacketLookup status = PacketLookup::Unknown;
  std::optional<RetainedPacket> packet;
};

struct RetentionStats {
  std::size_t packets = 0;
  std::size_t bytes = 0;
  std::uint64_t evictions = 0;
  std::uint64_t rejected = 0;
};

class RawPacketStore {
public:
  RawPacketStore(std::size_t max_packets, std::size_t max_bytes);
  bool insert(const sniffing::RawPacketView &packet) noexcept;
  void clear() noexcept;
  [[nodiscard]] PacketLookupResult get(const sniffing::PacketKey &key) const;
  [[nodiscard]] RetentionStats stats() const noexcept;

private:
  std::size_t max_packets_;
  std::size_t max_bytes_;
  // Replay callbacks block briefly rather than dropping data when a reader is
  // active. A non-blocking policy for live capture requires a separate queue.
  mutable std::mutex mutex_;
  std::deque<sniffing::PacketKey> order_;
  std::unordered_map<sniffing::PacketKey, RetainedPacket, PacketKeyHash>
      packets_;
  std::vector<sniffing::PacketKey> tombstones_;
  std::size_t next_tombstone_ = 0;
  std::size_t bytes_ = 0;
  std::uint64_t evictions_ = 0;
  std::atomic<std::uint64_t> rejected_{0};
};

struct PacketSummary {
  std::uint64_t cursor = 0;
  sniffing::PacketMetadata metadata;
  parsing::ParseCondition condition = parsing::ParseCondition::Malformed;
  parsing::RegistryRevision registry_revision;
  std::vector<parsing::ProtocolId> protocol_path;
  std::string source;
  std::string destination;
  std::string protocol;
  std::string length;
  std::string info;
};

PacketSummary extract_summary(const sniffing::RawPacketView &raw,
                              const parsing::ParsedPacketTree &tree,
                               const parsing::SummaryExtractor &extractor);

struct SummaryRead {
  std::vector<PacketSummary> entries;
  std::uint64_t next_cursor = 0;
  std::optional<std::uint64_t> oldest_cursor;
  std::optional<std::uint64_t> newest_cursor;
  bool cursor_evicted = false;
};

class SummaryJournal {
public:
  explicit SummaryJournal(std::size_t capacity);
  bool append(PacketSummary summary) noexcept;
  void clear() noexcept;
  [[nodiscard]] SummaryRead read(std::uint64_t after_cursor,
                                 std::size_t limit) const;
  [[nodiscard]] std::size_t size() const noexcept;

private:
  std::size_t capacity_;
  mutable std::mutex mutex_;
  std::deque<PacketSummary> entries_;
  std::uint64_t next_cursor_ = 1;
};

struct JournalEvent {
  std::uint64_t cursor = 0;
  sniffing::SnifferEvent event;
};

struct EventRead {
  std::vector<JournalEvent> entries;
  std::optional<std::uint64_t> oldest_cursor;
  std::optional<std::uint64_t> newest_cursor;
  bool cursor_evicted = false;
};

class EventJournal {
public:
  explicit EventJournal(std::size_t capacity);
  bool append(sniffing::SnifferEvent event) noexcept;
  void clear() noexcept;
  [[nodiscard]] EventRead read(std::uint64_t after_cursor,
                               std::size_t limit) const;

private:
  std::size_t capacity_;
  mutable std::mutex mutex_;
  std::deque<JournalEvent> entries_;
  std::uint64_t next_cursor_ = 1;
};

} // namespace pruftnet::replay

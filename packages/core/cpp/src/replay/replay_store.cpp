#include "pruftnet/replay/replay_store.hpp"

#include <algorithm>

namespace pruftnet::replay {
namespace {
std::size_t mix(std::size_t seed, std::uint64_t value) noexcept {
  return seed ^ (std::hash<std::uint64_t>{}(value) + 0x9e3779b9U +
                 (seed << 6U) + (seed >> 2U));
}
} // namespace

std::size_t
PacketKeyHash::operator()(const sniffing::PacketKey &key) const noexcept {
  return mix(
      mix(std::hash<std::uint64_t>{}(key.capture_id.high), key.capture_id.low),
      key.packet_id);
}
RawPacketStore::RawPacketStore(std::size_t max_packets, std::size_t max_bytes)
    : max_packets_(max_packets), max_bytes_(max_bytes) {
  packets_.reserve(max_packets_);
  tombstones_.reserve(max_packets_);
}

bool RawPacketStore::insert(const sniffing::RawPacketView &packet) noexcept {
  try {
    if (max_packets_ == 0 || packet.bytes.size() > max_bytes_) {
      ++rejected_;
      return false;
    }
    RetainedPacket retained{packet.metadata,
                            {packet.bytes.begin(), packet.bytes.end()}};
    std::lock_guard lock(mutex_);
    if (packets_.contains(packet.metadata.key))
      return true;

    const auto [inserted, was_inserted] =
        packets_.emplace(packet.metadata.key, std::move(retained));
    if (!was_inserted)
      return true;
    try {
      order_.push_back(packet.metadata.key);
    } catch (...) {
      packets_.erase(inserted);
      throw;
    }
    bytes_ += inserted->second.bytes.size();

    while (!order_.empty() && (packets_.size() > max_packets_ ||
                                bytes_ > max_bytes_)) {
      const auto key = order_.front();
      order_.pop_front();
      auto it = packets_.find(key);
      if (it == packets_.end())
        continue;
      bytes_ -= it->second.bytes.size();
      if (tombstones_.size() < max_packets_) {
        tombstones_.push_back(key);
      } else {
        tombstones_[next_tombstone_] = key;
        next_tombstone_ = (next_tombstone_ + 1) % max_packets_;
      }
      packets_.erase(it);
      ++evictions_;
    }
    return true;
  } catch (...) {
    ++rejected_;
    return false;
  }
}

void RawPacketStore::clear() noexcept {
  try {
    std::lock_guard lock(mutex_);
    order_.clear();
    packets_.clear();
    tombstones_.clear();
    next_tombstone_ = 0;
    bytes_ = 0;
    evictions_ = 0;
    rejected_ = 0;
  } catch (...) {
  }
}

PacketLookupResult RawPacketStore::get(const sniffing::PacketKey &key) const {
  std::lock_guard lock(mutex_);
  if (const auto it = packets_.find(key); it != packets_.end())
    return {PacketLookup::Found, it->second};
  if (std::find(tombstones_.begin(), tombstones_.end(), key) !=
      tombstones_.end())
    return {PacketLookup::Evicted, std::nullopt};
  return {PacketLookup::Unknown, std::nullopt};
}
RetentionStats RawPacketStore::stats() const noexcept {
  try {
    std::lock_guard lock(mutex_);
    return {packets_.size(), bytes_, evictions_, rejected_.load()};
  } catch (...) {
    return {};
  }
}

PacketSummary extract_summary(const sniffing::RawPacketView &raw,
                               const parsing::ParsedPacketTree &tree,
                               const parsing::SummaryExtractor &extractor) {
  auto fields = extractor.extract(raw, tree);
  return {0, raw.metadata, tree.condition(), tree.registry_revision(),
          std::move(fields.protocol_path), std::move(fields.source),
          std::move(fields.destination), std::move(fields.protocol),
          std::move(fields.length), std::move(fields.info)};
}

SummaryJournal::SummaryJournal(std::size_t capacity) : capacity_(capacity) {}
bool SummaryJournal::append(PacketSummary summary) noexcept {
  try {
    std::lock_guard lock(mutex_);
    if (capacity_ == 0)
      return false;
    summary.cursor = next_cursor_;
    entries_.push_back(std::move(summary));
    ++next_cursor_;
    if (entries_.size() > capacity_)
      entries_.pop_front();
    return true;
  } catch (...) {
    return false;
  }
}

void SummaryJournal::clear() noexcept {
  try {
    std::lock_guard lock(mutex_);
    entries_.clear();
    next_cursor_ = 1;
  } catch (...) {
  }
}

SummaryRead SummaryJournal::read(std::uint64_t after_cursor,
                                 std::size_t limit) const {
  std::lock_guard lock(mutex_);
  SummaryRead result;
  const auto bounded = std::min(limit, capacity_);
  result.cursor_evicted = !entries_.empty() && after_cursor != 0 &&
                          after_cursor + 1 < entries_.front().cursor;
  if (!entries_.empty()) {
    result.oldest_cursor = entries_.front().cursor;
    result.newest_cursor = entries_.back().cursor;
  }
  for (const auto &entry : entries_)
    if (entry.cursor > after_cursor && result.entries.size() < bounded)
      result.entries.push_back(entry);
  result.next_cursor =
      result.entries.empty() ? after_cursor : result.entries.back().cursor;
  return result;
}
std::size_t SummaryJournal::size() const noexcept {
  try {
    std::lock_guard lock(mutex_);
    return entries_.size();
  } catch (...) {
    return 0;
  }
}

EventJournal::EventJournal(std::size_t capacity) : capacity_(capacity) {}

bool EventJournal::append(sniffing::SnifferEvent event) noexcept {
  try {
    std::lock_guard lock(mutex_);
    if (capacity_ == 0) {
      return false;
    }
    entries_.push_back({next_cursor_, std::move(event)});
    ++next_cursor_;
    if (entries_.size() > capacity_)
      entries_.pop_front();
    return true;
  } catch (...) {
    return false;
  }
}

void EventJournal::clear() noexcept {
  try {
    std::lock_guard lock(mutex_);
    entries_.clear();
    next_cursor_ = 1;
  } catch (...) {
  }
}

EventRead EventJournal::read(std::uint64_t after_cursor,
                             std::size_t limit) const {
  std::lock_guard lock(mutex_);
  EventRead result;
  if (!entries_.empty()) {
    result.oldest_cursor = entries_.front().cursor;
    result.newest_cursor = entries_.back().cursor;
    result.cursor_evicted =
        after_cursor != 0 && after_cursor + 1 < entries_.front().cursor;
  }
  const auto bounded = std::min(limit, capacity_);
  for (const auto &entry : entries_) {
    if (entry.cursor > after_cursor && result.entries.size() < bounded) {
      result.entries.push_back(entry);
    }
  }
  return result;
}
} // namespace pruftnet::replay

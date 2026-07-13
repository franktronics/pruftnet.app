#include "pruftnet/replay/replay_store.hpp"

#include <algorithm>

namespace pruftnet::replay {
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

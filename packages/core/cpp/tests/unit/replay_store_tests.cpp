#include <atomic>
#include <cassert>
#include <thread>

#include "pruftnet/replay/replay_store.hpp"

int main() {
  using namespace pruftnet;
  const sniffing::CaptureId capture{1, 2};
  replay::SummaryJournal journal(2);
  for (std::uint64_t id = 1; id <= 3; ++id) {
    replay::PacketSummary summary;
    summary.metadata.key = {capture, id};
    assert(journal.append(std::move(summary)));
  }
  const auto stale = journal.read(0, 10);
  assert(stale.entries.size() == 2 && stale.entries.front().cursor == 2 &&
         !stale.cursor_evicted);
  assert(journal.append(replay::PacketSummary{}));
  const auto gap = journal.read(1, 1);
  assert(gap.cursor_evicted && gap.entries.size() == 1 && gap.next_cursor == 3);
  assert(journal.read(2, 10).entries.size() == 2);

  replay::EventJournal events(2);
  assert(events.append({.message = "one"}));
  assert(events.append({.message = "two"}));
  assert(events.append({.message = "three"}));
  assert(events.append({.message = "four"}));
  const auto event_read = events.read(1, 2);
  assert(event_read.cursor_evicted);
  assert(event_read.oldest_cursor == 3 && event_read.newest_cursor == 4);
  assert(event_read.entries.size() == 2);

  journal.clear();
  events.clear();
  assert(journal.read(0, 10).entries.empty());
  assert(journal.append(replay::PacketSummary{}));
  assert(journal.read(0, 10).entries.front().cursor == 1);
  assert(events.read(0, 10).entries.empty());
  assert(events.append({.message = "reset"}));
  assert(events.read(0, 10).entries.front().cursor == 1);

  replay::SummaryJournal contended_journal(1000);
  std::atomic<bool> reading = true;
  std::thread reader([&] {
    while (reading.load(std::memory_order_acquire))
      (void)contended_journal.read(0, 1);
  });
  for (std::uint64_t id = 1; id <= 1000; ++id)
    assert(contended_journal.append(replay::PacketSummary{}));
  reading.store(false, std::memory_order_release);
  reader.join();
  assert(contended_journal.size() == 1000);
  return 0;
}

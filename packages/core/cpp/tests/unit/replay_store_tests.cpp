#include <array>
#include <atomic>
#include <cassert>
#include <cstddef>
#include <variant>
#include <thread>

#include "pruftnet/replay/replay_store.hpp"

int main() {
  using namespace pruftnet;
  replay::RawPacketStore store(2, 7);
  const sniffing::CaptureId capture{1, 2};
  const std::array<std::byte, 3> bytes{};
  for (std::uint64_t id = 1; id <= 3; ++id) {
    sniffing::RawPacketView packet{
        {.key = {capture, id}, .captured_len = 3, .wire_len = 3}, bytes};
    assert(store.insert(packet));
  }
  assert(store.get({capture, 1}).status == replay::PacketLookup::Evicted);
  const auto found = store.get({capture, 2});
  assert(found.status == replay::PacketLookup::Found &&
         found.packet->bytes.size() == 3);
  assert(store.get({capture, 9}).status == replay::PacketLookup::Unknown);
  assert(store.stats().packets == 2 && store.stats().evictions == 1);

  replay::RawPacketStore sparse_store(2, 6);
  const std::array<std::byte, 8> oversized_bytes{};
  sniffing::RawPacketView rejected{
      {.key = {capture, 2}, .captured_len = 8, .wire_len = 8},
      oversized_bytes};
  assert(!sparse_store.insert(rejected));
  for (const std::uint64_t id : {1, 3, 4}) {
    sniffing::RawPacketView packet{
        {.key = {capture, id}, .captured_len = 3, .wire_len = 3}, bytes};
    assert(sparse_store.insert(packet));
  }
  assert(sparse_store.get({capture, 1}).status ==
         replay::PacketLookup::Evicted);
  assert(sparse_store.get({capture, 2}).status ==
         replay::PacketLookup::Unknown);

  sniffing::RawPacketView packet_five{
      {.key = {capture, 5}, .captured_len = 3, .wire_len = 3}, bytes};
  sniffing::RawPacketView packet_six{
      {.key = {capture, 6}, .captured_len = 3, .wire_len = 3}, bytes};
  assert(sparse_store.insert(packet_five));
  assert(sparse_store.insert(packet_six));
  assert(sparse_store.get({capture, 1}).status ==
         replay::PacketLookup::Unknown);
  assert(sparse_store.get({capture, 3}).status ==
         replay::PacketLookup::Evicted);

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

  store.clear();
  journal.clear();
  events.clear();
  const auto cleared = store.stats();
  assert(cleared.packets == 0 && cleared.bytes == 0 &&
         cleared.evictions == 0 && cleared.rejected == 0);
  assert(store.get({capture, 1}).status == replay::PacketLookup::Unknown);
  assert(journal.read(0, 10).entries.empty());
  assert(journal.append(replay::PacketSummary{}));
  assert(journal.read(0, 10).entries.front().cursor == 1);
  assert(events.read(0, 10).entries.empty());
  assert(events.append({.message = "reset"}));
  assert(events.read(0, 10).entries.front().cursor == 1);

  replay::RawPacketStore contended_store(1000, 3000);
  replay::SummaryJournal contended_journal(1000);
  std::atomic<bool> reading = true;
  std::thread reader([&] {
    while (reading) {
      (void)contended_store.stats();
      (void)contended_journal.read(0, 1);
    }
  });
  for (std::uint64_t id = 1; id <= 1000; ++id) {
    sniffing::RawPacketView packet{
        {.key = {capture, id}, .captured_len = 3, .wire_len = 3}, bytes};
    assert(contended_store.insert(packet));
    assert(contended_journal.append(replay::PacketSummary{}));
  }
  reading = false;
  reader.join();
  assert(contended_store.stats().packets == 1000);
  assert(contended_store.stats().rejected == 0);
  assert(contended_journal.size() == 1000);
  return 0;
}

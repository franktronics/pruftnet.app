#include <cassert>
#include <chrono>
#include <cstddef>
#include <memory>
#include <thread>
#include <variant>

#include "pruftnet/replay/replay_store.hpp"
#include "pruftnet/sniffing/network_sniffer.hpp"
#include "tests/test_config.hpp"

int main() {
  using namespace pruftnet;
  replay::SummaryJournal journal(32);
  replay::EventJournal events(32);
  parsing::RegistrySnapshotPtr registry;
  std::unique_ptr<parsing::SummaryExtractor> extractor;

  const auto run_replay = [&] {
    sniffing::SnifferOptions options;
    options.interfaces.emplace_back();
    options.interfaces.front().ring_slots = 32;
    auto sniffer = sniffing::NetworkSniffer::offline(
        tests::fixture_path("ethernet_ipv4_tcp_udp.pcap").string(),
        std::move(options),
        [&](const sniffing::RawPacketView &raw,
            const parsing::ParsedPacketTree &parsed) noexcept {
          assert(registry);
          assert(extractor);
          assert(journal.append(
              replay::extract_summary(raw, parsed, *extractor)));
        },
        [&](const sniffing::SnifferEvent &event) noexcept {
          assert(events.append(event));
        });
    registry = sniffer.registry_snapshot();
    extractor = std::make_unique<parsing::SummaryExtractor>(*registry);
    assert(registry && !sniffer.start());
    const auto deadline =
        std::chrono::steady_clock::now() + tests::kOfflineSniffingTimeout;
    while (sniffer.is_running() && std::chrono::steady_clock::now() < deadline)
      std::this_thread::sleep_for(std::chrono::milliseconds(5));
    sniffer.stop();
  };

  run_replay();

  const auto summaries = journal.read(0, 32);
  assert(summaries.entries.size() == tests::kOfflineExpectedPacketCount);
  assert(summaries.entries.front().source == "192.0.2.10");
  assert(summaries.entries.front().destination == "198.51.100.20");
  assert(summaries.entries.front().protocol == "UDP");
  assert(summaries.entries.front().length == "60");
  assert(summaries.entries.front().info == "40001 -> 5001 Len=26");
  for (const auto &summary : summaries.entries) {
    assert(summary.source.size() <= parsing::kPacketSummaryColumnMaxBytes);
    assert(summary.destination.size() <= parsing::kPacketSummaryColumnMaxBytes);
    assert(summary.protocol.size() <= parsing::kPacketSummaryColumnMaxBytes);
    assert(summary.length == std::to_string(summary.metadata.wire_len));
    assert(summary.info.size() <= parsing::kPacketSummaryColumnMaxBytes);
  }
  const auto first_capture_key = summaries.entries.front().metadata.key;
  journal.clear();
  events.clear();
  assert(journal.read(0, 32).entries.empty());
  assert(events.read(0, 32).entries.empty());

  run_replay();
  const auto restarted = journal.read(0, 32);
  assert(restarted.entries.size() == tests::kOfflineExpectedPacketCount);
  assert(restarted.entries.front().cursor == 1);
  assert(restarted.entries.front().metadata.key.capture_id !=
         first_capture_key.capture_id);
  for (const auto &summary : restarted.entries)
    assert(summary.metadata.key.capture_id ==
           restarted.entries.front().metadata.key.capture_id);
  return 0;
}

#include <cassert>
#include <chrono>
#include <cstddef>
#include <memory>
#include <thread>
#include <variant>

#include "parsing/packet_parser.hpp"
#include "pruftnet/parsing/packet_tree_codec.hpp"
#include "pruftnet/replay/replay_store.hpp"
#include "pruftnet/sniffing/network_sniffer.hpp"
#include "tests/test_config.hpp"

int main() {
  using namespace pruftnet;
  replay::RawPacketStore store(32, 4096);
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
          assert(store.insert(raw));
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
  const auto lookup = store.get(summaries.entries.front().metadata.key);
  assert(lookup.status == replay::PacketLookup::Found);
  parsing::internal::PacketParser parser(registry);
  const sniffing::RawPacketView raw{lookup.packet->metadata,
                                    lookup.packet->bytes};
  const auto tree = parser.parse(raw);
  parsing::PacketTreeEncoder encoder;
  const auto encoded = encoder.encode(tree);
  const auto *bytes = std::get_if<std::span<const std::byte>>(&encoded);
  assert(bytes && !bytes->empty());
  assert(std::holds_alternative<parsing::VerifiedPacketTreeView>(
      parsing::verify_packet_tree(*bytes, *registry)));

  const auto first_capture_key = summaries.entries.front().metadata.key;
  store.clear();
  journal.clear();
  events.clear();
  const auto cleared_stats = store.stats();
  assert(cleared_stats.packets == 0 && cleared_stats.bytes == 0 &&
         cleared_stats.evictions == 0 && cleared_stats.rejected == 0);
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
  assert(store.get(first_capture_key).status == replay::PacketLookup::Unknown);
  assert(store.stats().packets == tests::kOfflineExpectedPacketCount);
  return 0;
}

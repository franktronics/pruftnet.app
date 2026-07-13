#include <cassert>
#include <atomic>
#include <chrono>
#include <cstdint>
#include <memory>
#include <thread>
#include <vector>

#include "pruftnet/sniffing/sniffer_error.hpp"
#include "pruftnet/sniffing/sniffer_event.hpp"
#include "pruftnet/sniffing/sniffer_options.hpp"
#include "sniffing/sniffer_options_validation.hpp"
#include "sniffing/sniffer_runtime.hpp"
#include "tests/support/fake_packet_source.hpp"
#include "tests/support/runtime_test_support.hpp"

namespace {

using pruftnet::sniffing::SnifferErrorCode;
using pruftnet::sniffing::SnifferEvent;
using pruftnet::sniffing::SnifferOptions;
using pruftnet::sniffing::internal::SnifferOptionsValidation;
using pruftnet::sniffing::internal::SnifferRuntime;
using pruftnet::tests::FakePacketSource;
using pruftnet::tests::fake_packet;
using pruftnet::tests::one_source;
using pruftnet::tests::single_interface_options;

std::uint64_t count_ring_full_events(const std::vector<SnifferEvent>& events) {
    std::uint64_t count = 0;
    for (const auto& event : events) {
        if (event.code == SnifferErrorCode::RingFull) {
            ++count;
        }
    }
    return count;
}

void slow_analyzer_builds_backlog_without_losing_raw_packets() {
    constexpr std::uint64_t kPackets = 100;
    auto source = std::make_unique<FakePacketSource>();
    source->configured_snapshot_length = 64;
    for (std::uint64_t index = 0; index < kPackets; ++index)
        source->packets.push_back(fake_packet(64));

    auto options = single_interface_options();
    options.interfaces[0].ring_slots = 128;
    options.interfaces[0].ring_bytes = 128 * 64;
    options.interfaces[0].pcap_dispatch_batch_size = 100;
    options.spool_flush_bytes = 1;
    std::atomic<bool> release_analyzer{false};
    SnifferRuntime runtime(
        options,
        one_source(std::move(source)),
        SnifferOptionsValidation{.require_interface_name = false},
        [&](const auto&, const auto&) {
            release_analyzer.wait(false, std::memory_order_acquire);
        },
        {});

    assert(!runtime.start().has_value());
    const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(2);
    auto while_blocked = runtime.stats();
    while (while_blocked.packets_persisted != kPackets &&
           std::chrono::steady_clock::now() < deadline) {
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
        while_blocked = runtime.stats();
    }

    assert(while_blocked.packets_persisted == kPackets);
    assert(while_blocked.capture_queue_full_drops == 0);
    assert(while_blocked.capture_queue_oversize_drops == 0);
    assert(while_blocked.packets_analyzed == 0);
    assert(while_blocked.analysis_backlog_packets == kPackets);
    release_analyzer.store(true, std::memory_order_release);
    release_analyzer.notify_all();
    pruftnet::tests::wait_until_stopped(runtime, std::chrono::seconds(2));

    const auto final = runtime.stats();
    assert(final.packets_persisted == kPackets);
    assert(final.packets_analyzed == kPackets);
    assert(final.analysis_backlog_packets == 0);
    assert(final.analysis_backlog_bytes == 0);
}

} // namespace

int main() {
    slow_analyzer_builds_backlog_without_losing_raw_packets();
    auto source = std::make_unique<FakePacketSource>();
    source->configured_snapshot_length = 64;
    for (std::uint8_t index = 0; index < 100; ++index) {
        source->packets.push_back(fake_packet(32, 32, index));
    }

    SnifferOptions options = single_interface_options();
    options.interfaces[0].ring_slots = 1;
    options.interfaces[0].pcap_dispatch_batch_size = 100;
    options.stats_poll_interval = std::chrono::milliseconds(0);

    std::atomic<std::uint64_t> callbacks{0};
    std::vector<SnifferEvent> events;
    SnifferRuntime runtime(
        options,
        one_source(std::move(source)),
        SnifferOptionsValidation{.require_interface_name = false},
        [&](const auto&, const auto&) {
            callbacks.fetch_add(1, std::memory_order_relaxed);
            std::this_thread::sleep_for(std::chrono::milliseconds(2));
        },
        [&](const SnifferEvent& event) {
            events.push_back(event);
        });

    assert(!runtime.start().has_value());

    const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(2);
    while (runtime.is_running() && std::chrono::steady_clock::now() < deadline) {
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }

    runtime.stop();

    const auto stats = runtime.stats();
    assert(stats.packets_observed == 100);
    assert(stats.capture_queue_accepted >= 1);
    assert(stats.packets_analyzed == callbacks.load(std::memory_order_relaxed));
    assert(stats.capture_queue_full_drops > 0);
    assert(stats.capture_queue_full_drops + stats.capture_queue_accepted == stats.packets_observed);
    assert(count_ring_full_events(events) == 1);
    return 0;
}

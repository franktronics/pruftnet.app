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

} // namespace

int main() {
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
        [&](const auto&, const auto&, const auto&) {
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
    assert(stats.packets_seen == 100);
    assert(stats.packets_enqueued >= 1);
    assert(stats.packets_parsed == callbacks.load(std::memory_order_relaxed));
    assert(stats.app_ring_drops > 0);
    assert(stats.app_ring_drops + stats.packets_enqueued == stats.packets_seen);
    assert(count_ring_full_events(events) == 1);
    return 0;
}

#include <algorithm>
#include <array>
#include <cassert>
#include <atomic>
#include <chrono>
#include <cstdint>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <thread>
#include <vector>

#include "pruftnet/sniffing/sniffer_error.hpp"
#include "pruftnet/sniffing/sniffer_event.hpp"
#include "pruftnet/sniffing/sniffer_options.hpp"
#include "pruftnet/sniffing/sniffer_stats.hpp"
#include "sniffing/sniffer_options_validation.hpp"
#include "sniffing/sniffer_runtime.hpp"
#include "tests/support/fake_packet_source.hpp"
#include "tests/support/runtime_test_support.hpp"

namespace {

using pruftnet::sniffing::InterfaceStatsSnapshot;
using pruftnet::sniffing::PacketMetadata;
using pruftnet::sniffing::SnifferErrorCode;
using pruftnet::sniffing::SnifferEvent;
using pruftnet::sniffing::SnifferInterfaceOptions;
using pruftnet::sniffing::SnifferOptions;
using pruftnet::sniffing::SnifferSeverity;
using pruftnet::sniffing::kAutoInterfaceId;
using pruftnet::sniffing::make_sniffer_error;
using pruftnet::sniffing::internal::PacketSource;
using pruftnet::sniffing::internal::PacketSourceDispatchStatus;
using pruftnet::sniffing::internal::SnifferOptionsValidation;
using pruftnet::sniffing::internal::SnifferRuntime;
using pruftnet::tests::FakePacketSource;
using pruftnet::tests::fake_packet;
using pruftnet::tests::wait_until_stopped;

SnifferInterfaceOptions interface_options(std::uint32_t id, std::size_t ring_slots = 16, int batch_size = 8) {
    SnifferInterfaceOptions options;
    options.id = id;
    options.ring_slots = ring_slots;
    options.pcap_dispatch_batch_size = batch_size;
    return options;
}

std::vector<std::unique_ptr<PacketSource>> two_sources(
    std::unique_ptr<FakePacketSource> first,
    std::unique_ptr<FakePacketSource> second) {
    std::vector<std::unique_ptr<PacketSource>> sources;
    sources.push_back(std::move(first));
    sources.push_back(std::move(second));
    return sources;
}

const InterfaceStatsSnapshot* find_interface_stats(
    const pruftnet::sniffing::SnifferStatsSnapshot& stats,
    std::uint32_t interface_id) {
    for (const auto& interface : stats.interfaces) {
        if (interface.interface_id == interface_id) {
            return &interface;
        }
    }

    return nullptr;
}

std::uint64_t count_events(
    const std::vector<SnifferEvent>& events,
    SnifferErrorCode code,
    std::uint32_t interface_id) {
    std::uint64_t count = 0;
    for (const auto& event : events) {
        if (event.code == code && event.interface_id == interface_id) {
            ++count;
        }
    }
    return count;
}

void distinct_interfaces_emit_metadata_and_stats() {
    auto first = std::make_unique<FakePacketSource>();
    first->name = "first";
    first->packets.push_back(fake_packet(32, 32, 1));
    first->packets.push_back(fake_packet(32, 32, 2));
    first->packets.push_back(fake_packet(32, 32, 3));

    auto second = std::make_unique<FakePacketSource>();
    second->name = "second";
    second->packets.push_back(fake_packet(48, 48, 4));
    second->packets.push_back(fake_packet(48, 48, 5));

    SnifferOptions options;
    options.interfaces.push_back(interface_options(10));
    options.interfaces.push_back(interface_options(20));
    options.stats_poll_interval = std::chrono::milliseconds(0);

    std::vector<PacketMetadata> observed;
    SnifferRuntime runtime(
        options,
        two_sources(std::move(first), std::move(second)),
        SnifferOptionsValidation{.require_interface_name = false},
        [&](const auto& raw, const auto&) {
            observed.push_back(raw.metadata);
        },
        {});

    assert(!runtime.start().has_value());
    wait_until_stopped(runtime);

    assert(observed.size() == 5);
    std::array<std::uint64_t, 2> interface_counts = {0, 0};
    std::vector<std::uint64_t> sequences;
    for (const auto& metadata : observed) {
        if (metadata.interface_id == 10) {
            ++interface_counts[0];
        } else if (metadata.interface_id == 20) {
            ++interface_counts[1];
        } else {
            assert(false);
        }
        sequences.push_back(metadata.key.packet_id);
    }

    std::sort(sequences.begin(), sequences.end());
    assert(sequences == std::vector<std::uint64_t>({1, 2, 3, 4, 5}));
    assert(interface_counts[0] == 3);
    assert(interface_counts[1] == 2);

    const auto stats = runtime.stats();
    assert(stats.interfaces.size() == 2);
    assert(stats.packets_seen == 5);
    assert(stats.packets_enqueued == 5);
    assert(stats.packets_parsed == 5);
    assert(stats.app_ring_drops == 0);

    const auto* first_stats = find_interface_stats(stats, 10);
    const auto* second_stats = find_interface_stats(stats, 20);
    assert(first_stats != nullptr);
    assert(second_stats != nullptr);
    assert(first_stats->packets_seen == 3);
    assert(first_stats->packets_parsed == 3);
    assert(first_stats->ring_capacity == 16);
    assert(second_stats->packets_seen == 2);
    assert(second_stats->packets_parsed == 2);
    assert(second_stats->ring_capacity == 16);
}

void auto_interface_ids_are_assigned_by_order() {
    auto first = std::make_unique<FakePacketSource>();
    first->packets.push_back(fake_packet(16));

    auto second = std::make_unique<FakePacketSource>();
    second->packets.push_back(fake_packet(16));

    SnifferInterfaceOptions first_interface;
    first_interface.ring_slots = 8;
    SnifferInterfaceOptions second_interface;
    second_interface.ring_slots = 8;

    SnifferOptions options;
    options.interfaces.push_back(first_interface);
    options.interfaces.push_back(second_interface);
    options.stats_poll_interval = std::chrono::milliseconds(0);

    std::vector<std::uint32_t> observed_ids;
    SnifferRuntime runtime(
        options,
        two_sources(std::move(first), std::move(second)),
        SnifferOptionsValidation{.require_interface_name = false},
        [&](const auto& raw, const auto&) {
            observed_ids.push_back(raw.metadata.interface_id);
        },
        {});

    assert(!runtime.start().has_value());
    wait_until_stopped(runtime);

    std::sort(observed_ids.begin(), observed_ids.end());
    assert(observed_ids == std::vector<std::uint32_t>({0, 1}));
}

void auto_source_event_ids_are_rewritten_to_resolved_ids() {
    auto first = std::make_unique<FakePacketSource>();
    first->name = "first";
    first->open_warnings.push_back(SnifferEvent::from_error(make_sniffer_error(
        SnifferErrorCode::PcapConfigureFailed,
        SnifferSeverity::Warning,
        "first auto-id warning",
        first->name,
        0,
        {},
        true,
        kAutoInterfaceId)));

    auto second = std::make_unique<FakePacketSource>();
    second->name = "second";
    second->open_warnings.push_back(SnifferEvent::from_error(make_sniffer_error(
        SnifferErrorCode::PcapConfigureFailed,
        SnifferSeverity::Warning,
        "second auto-id warning",
        second->name,
        0,
        {},
        true,
        kAutoInterfaceId)));

    SnifferOptions options;
    options.interfaces.push_back(SnifferInterfaceOptions{});
    options.interfaces.push_back(SnifferInterfaceOptions{});
    options.stats_poll_interval = std::chrono::milliseconds(0);

    std::vector<SnifferEvent> events;
    SnifferRuntime runtime(
        options,
        two_sources(std::move(first), std::move(second)),
        SnifferOptionsValidation{.require_interface_name = false},
        [](const auto&, const auto&) {},
        [&](const SnifferEvent& event) {
            events.push_back(event);
        });

    assert(!runtime.start().has_value());
    wait_until_stopped(runtime);

    assert(count_events(events, SnifferErrorCode::PcapConfigureFailed, 0) == 1);
    assert(count_events(events, SnifferErrorCode::PcapConfigureFailed, 1) == 1);
}

void second_interface_packets_wake_parser_while_first_is_idle() {
    auto idle = std::make_unique<FakePacketSource>();
    idle->after_packets_status = PacketSourceDispatchStatus::NoPacketsAvailable;
    idle->no_packets_delay = std::chrono::milliseconds(1);

    auto active = std::make_unique<FakePacketSource>();
    active->packets.push_back(fake_packet(32));
    active->after_packets_status = PacketSourceDispatchStatus::NoPacketsAvailable;
    active->no_packets_delay = std::chrono::milliseconds(1);

    SnifferOptions options;
    options.interfaces.push_back(interface_options(30));
    options.interfaces.push_back(interface_options(40));
    options.stats_poll_interval = std::chrono::milliseconds(0);

    std::atomic<bool> active_packet_seen{false};
    SnifferRuntime runtime(
        options,
        two_sources(std::move(idle), std::move(active)),
        SnifferOptionsValidation{.require_interface_name = false},
        [&](const auto& raw, const auto&) {
            if (raw.metadata.interface_id == 40) {
                active_packet_seen.store(true, std::memory_order_release);
            }
        },
        {});

    assert(!runtime.start().has_value());

    const auto deadline = std::chrono::steady_clock::now() + std::chrono::milliseconds(200);
    while (!active_packet_seen.load(std::memory_order_acquire) && std::chrono::steady_clock::now() < deadline) {
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }

    runtime.stop();
    assert(active_packet_seen.load(std::memory_order_acquire));
}

void start_failure_closes_previously_opened_interfaces() {
    auto first = std::make_unique<FakePacketSource>();
    auto* first_ptr = first.get();

    auto second = std::make_unique<FakePacketSource>();
    auto* second_ptr = second.get();
    second->open_error = pruftnet::sniffing::make_sniffer_error(
        SnifferErrorCode::PcapOpenFailed,
        SnifferSeverity::Error,
        "forced second interface failure",
        second->name);

    SnifferOptions options;
    options.interfaces.push_back(interface_options(1));
    options.interfaces.push_back(interface_options(2));

    SnifferRuntime runtime(
        options,
        two_sources(std::move(first), std::move(second)),
        SnifferOptionsValidation{.require_interface_name = false},
        [](const auto&, const auto&) {},
        {});

    const auto error = runtime.start();
    assert(error.has_value());
    assert(error->code == SnifferErrorCode::PcapOpenFailed);
    assert(!runtime.is_running());
    assert(first_ptr->open_calls == 1);
    assert(second_ptr->open_calls == 1);
    assert(first_ptr->close_calls >= 1);
    assert(second_ptr->close_calls >= 1);
    assert(!first_ptr->is_open());
    assert(!second_ptr->is_open());
}

void ring_pressure_is_isolated_per_interface() {
    auto noisy = std::make_unique<FakePacketSource>();
    noisy->configured_snapshot_length = 64;
    for (std::uint8_t index = 0; index < 100; ++index) {
        noisy->packets.push_back(fake_packet(32, 32, index));
    }

    auto quiet = std::make_unique<FakePacketSource>();
    quiet->configured_snapshot_length = 64;
    for (std::uint8_t index = 0; index < 4; ++index) {
        quiet->packets.push_back(fake_packet(32, 32, static_cast<std::uint8_t>(200 + index)));
    }

    SnifferOptions options;
    options.interfaces.push_back(interface_options(11, 1, 100));
    options.interfaces.push_back(interface_options(22, 16, 4));
    options.stats_poll_interval = std::chrono::milliseconds(0);

    std::vector<SnifferEvent> events;
    std::mutex events_mutex;
    SnifferRuntime runtime(
        options,
        two_sources(std::move(noisy), std::move(quiet)),
        SnifferOptionsValidation{.require_interface_name = false},
        [&](const auto&, const auto&) {
            std::this_thread::sleep_for(std::chrono::milliseconds(2));
        },
        [&](const SnifferEvent& event) {
            std::lock_guard lock(events_mutex);
            events.push_back(event);
        });

    assert(!runtime.start().has_value());
    wait_until_stopped(runtime, std::chrono::seconds(2));

    const auto stats = runtime.stats();
    const auto* noisy_stats = find_interface_stats(stats, 11);
    const auto* quiet_stats = find_interface_stats(stats, 22);
    assert(noisy_stats != nullptr);
    assert(quiet_stats != nullptr);
    assert(noisy_stats->packets_seen == 100);
    assert(noisy_stats->app_ring_drops > 0);
    assert(noisy_stats->packets_enqueued + noisy_stats->app_ring_drops == noisy_stats->packets_seen);
    assert(quiet_stats->packets_seen == 4);
    assert(quiet_stats->app_ring_drops == 0);
    assert(quiet_stats->packets_parsed == 4);

    std::lock_guard lock(events_mutex);
    assert(count_events(events, SnifferErrorCode::RingFull, 11) == 1);
    assert(count_events(events, SnifferErrorCode::RingFull, 22) == 0);
}

void stop_during_multi_interface_pressure_is_safe() {
    auto first = std::make_unique<FakePacketSource>();
    first->after_packets_status = PacketSourceDispatchStatus::NoPacketsAvailable;
    first->no_packets_delay = std::chrono::milliseconds(1);
    for (std::uint8_t index = 0; index < 100; ++index) {
        first->packets.push_back(fake_packet(32, 32, index));
    }

    auto second = std::make_unique<FakePacketSource>();
    second->after_packets_status = PacketSourceDispatchStatus::NoPacketsAvailable;
    second->no_packets_delay = std::chrono::milliseconds(1);
    for (std::uint8_t index = 0; index < 100; ++index) {
        second->packets.push_back(fake_packet(32, 32, static_cast<std::uint8_t>(100 + index)));
    }

    SnifferOptions options;
    options.interfaces.push_back(interface_options(31, 8, 16));
    options.interfaces.push_back(interface_options(32, 8, 16));
    options.stats_poll_interval = std::chrono::milliseconds(0);

    std::atomic<std::uint64_t> callbacks{0};
    SnifferRuntime runtime(
        options,
        two_sources(std::move(first), std::move(second)),
        SnifferOptionsValidation{.require_interface_name = false},
        [&](const auto&, const auto&) {
            callbacks.fetch_add(1, std::memory_order_relaxed);
            std::this_thread::sleep_for(std::chrono::milliseconds(1));
        },
        {});

    assert(!runtime.start().has_value());
    std::this_thread::sleep_for(std::chrono::milliseconds(5));
    runtime.stop();
    assert(!runtime.is_running());
    assert(callbacks.load(std::memory_order_relaxed) >= 1);
}

void callback_can_stop_multi_interface_runtime() {
    auto first = std::make_unique<FakePacketSource>();
    first->packets.push_back(fake_packet(32));

    auto second = std::make_unique<FakePacketSource>();
    second->packets.push_back(fake_packet(32));

    SnifferOptions options;
    options.interfaces.push_back(interface_options(41));
    options.interfaces.push_back(interface_options(42));
    options.stats_poll_interval = std::chrono::milliseconds(0);

    SnifferRuntime* runtime_ptr = nullptr;
    std::atomic<std::uint64_t> callbacks{0};
    SnifferRuntime runtime(
        options,
        two_sources(std::move(first), std::move(second)),
        SnifferOptionsValidation{.require_interface_name = false},
        [&](const auto&, const auto&) {
            callbacks.fetch_add(1, std::memory_order_relaxed);
            runtime_ptr->stop();
        },
        {});
    runtime_ptr = &runtime;

    assert(!runtime.start().has_value());
    wait_until_stopped(runtime);
    assert(!runtime.is_running());
    assert(callbacks.load(std::memory_order_relaxed) >= 1);
}

void event_callback_throw_does_not_crash_multi_interface_runtime() {
    auto first = std::make_unique<FakePacketSource>();
    first->after_packets_status = PacketSourceDispatchStatus::Error;
    first->dispatch_error_message = "first forced error";

    auto second = std::make_unique<FakePacketSource>();
    second->after_packets_status = PacketSourceDispatchStatus::NoPacketsAvailable;
    second->no_packets_delay = std::chrono::milliseconds(1);

    SnifferOptions options;
    options.interfaces.push_back(interface_options(51));
    options.interfaces.push_back(interface_options(52));
    options.stats_poll_interval = std::chrono::milliseconds(0);

    std::atomic<bool> event_seen{false};
    SnifferRuntime runtime(
        options,
        two_sources(std::move(first), std::move(second)),
        SnifferOptionsValidation{.require_interface_name = false},
        [](const auto&, const auto&) {},
        [&](const SnifferEvent&) {
            event_seen.store(true, std::memory_order_relaxed);
            throw std::runtime_error("event callback failure");
        });

    assert(!runtime.start().has_value());
    wait_until_stopped(runtime);
    assert(event_seen.load(std::memory_order_relaxed));
    assert(!runtime.is_running());
}

} // namespace

int main() {
    distinct_interfaces_emit_metadata_and_stats();
    auto_interface_ids_are_assigned_by_order();
    auto_source_event_ids_are_rewritten_to_resolved_ids();
    second_interface_packets_wake_parser_while_first_is_idle();
    start_failure_closes_previously_opened_interfaces();
    ring_pressure_is_isolated_per_interface();
    stop_during_multi_interface_pressure_is_safe();
    callback_can_stop_multi_interface_runtime();
    event_callback_throw_does_not_crash_multi_interface_runtime();
    return 0;
}

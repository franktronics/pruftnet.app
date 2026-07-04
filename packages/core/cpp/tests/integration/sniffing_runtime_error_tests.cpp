#include <cassert>
#include <atomic>
#include <chrono>
#include <memory>
#include <stdexcept>
#include <thread>
#include <vector>

#include <pcap/pcap.h>

#include "pruftnet/sniffing/sniffer_error.hpp"
#include "pruftnet/sniffing/sniffer_options.hpp"
#include "sniffing/sniffer_options_validation.hpp"
#include "sniffing/sniffer_runtime.hpp"
#include "tests/support/fake_packet_source.hpp"
#include "tests/support/runtime_test_support.hpp"

namespace {

using pruftnet::sniffing::SnifferErrorCode;
using pruftnet::sniffing::SnifferEvent;
using pruftnet::sniffing::SnifferOptions;
using pruftnet::sniffing::SnifferSeverity;
using pruftnet::sniffing::make_sniffer_error;
using pruftnet::sniffing::internal::PacketSourceDispatchStatus;
using pruftnet::sniffing::internal::SnifferOptionsValidation;
using pruftnet::sniffing::internal::SnifferRuntime;
using pruftnet::tests::FakePacketSource;
using pruftnet::tests::fake_packet;
using pruftnet::tests::one_source;
using pruftnet::tests::single_interface_options;

SnifferOptions base_options() {
    SnifferOptions options = single_interface_options();
    options.interfaces[0].ring_slots = 8;
    options.interfaces[0].pcap_dispatch_batch_size = 4;
    options.stats_poll_interval = std::chrono::milliseconds(0);
    return options;
}

bool has_event_code(const std::vector<SnifferEvent>& events, SnifferErrorCode code) {
    for (const auto& event : events) {
        if (event.code == code) {
            return true;
        }
    }
    return false;
}

void wait_until_stopped(SnifferRuntime& runtime) {
    const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(1);
    while (runtime.is_running() && std::chrono::steady_clock::now() < deadline) {
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }
    runtime.stop();
}

void null_packet_source_is_rejected() {
    SnifferRuntime runtime(
        base_options(),
        one_source(nullptr),
        SnifferOptionsValidation{.require_interface_name = false},
        [](const auto&, const auto&) {},
        {});

    const auto error = runtime.start();
    assert(error.has_value());
    assert(error->code == SnifferErrorCode::InvalidOptions);
}

void missing_packet_callback_is_rejected() {
    auto source = std::make_unique<FakePacketSource>();
    SnifferRuntime runtime(
        base_options(),
        one_source(std::move(source)),
        SnifferOptionsValidation{.require_interface_name = false},
        {},
        {});

    const auto error = runtime.start();
    assert(error.has_value());
    assert(error->code == SnifferErrorCode::InvalidOptions);
}

void open_failure_is_returned_from_start() {
    auto source = std::make_unique<FakePacketSource>();
    source->open_error = make_sniffer_error(
        SnifferErrorCode::PcapOpenFailed,
        SnifferSeverity::Error,
        "fake open failed",
        source->name);

    SnifferRuntime runtime(
        base_options(),
        one_source(std::move(source)),
        SnifferOptionsValidation{.require_interface_name = false},
        [](const auto&, const auto&) {},
        {});

    const auto error = runtime.start();
    assert(error.has_value());
    assert(error->code == SnifferErrorCode::PcapOpenFailed);
}

void unsupported_link_type_fails_start() {
    auto source = std::make_unique<FakePacketSource>();
    source->configured_link_type = 999999;

    auto options = base_options();
    options.accepted_link_types = {DLT_EN10MB};

    SnifferRuntime runtime(
        options,
        one_source(std::move(source)),
        SnifferOptionsValidation{.require_interface_name = false},
        [](const auto&, const auto&) {},
        {});

    const auto error = runtime.start();
    assert(error.has_value());
    assert(error->code == SnifferErrorCode::UnsupportedLinkType);
}

void invalid_snapshot_length_fails_start() {
    auto source = std::make_unique<FakePacketSource>();
    source->configured_snapshot_length = 0;

    SnifferRuntime runtime(
        base_options(),
        one_source(std::move(source)),
        SnifferOptionsValidation{.require_interface_name = false},
        [](const auto&, const auto&) {},
        {});

    const auto error = runtime.start();
    assert(error.has_value());
    assert(error->code == SnifferErrorCode::InvalidOptions);
}

void ring_memory_budget_failure_closes_open_sources() {
    auto source = std::make_unique<FakePacketSource>();
    auto* source_ptr = source.get();

    auto options = base_options();
    options.max_total_ring_bytes = 1;

    SnifferRuntime runtime(
        options,
        one_source(std::move(source)),
        SnifferOptionsValidation{.require_interface_name = false},
        [](const auto&, const auto&) {},
        {});

    const auto error = runtime.start();
    assert(error.has_value());
    assert(error->code == SnifferErrorCode::MemoryBudgetExceeded);
    assert(!runtime.is_running());
    assert(source_ptr->open_calls == 1);
    assert(source_ptr->close_calls >= 1);
    assert(!source_ptr->is_open());
}

void open_warning_is_emitted_from_start() {
    auto source = std::make_unique<FakePacketSource>();
    source->open_warnings.push_back(SnifferEvent::from_error(make_sniffer_error(
        SnifferErrorCode::PcapConfigureFailed,
        SnifferSeverity::Warning,
        "fake open warning",
        source->name,
        0,
        {},
        true)));

    std::vector<SnifferEvent> events;
    SnifferRuntime runtime(
        base_options(),
        one_source(std::move(source)),
        SnifferOptionsValidation{.require_interface_name = false},
        [](const auto&, const auto&) {},
        [&](const SnifferEvent& event) {
            events.push_back(event);
        });

    assert(!runtime.start().has_value());
    wait_until_stopped(runtime);
    assert(has_event_code(events, SnifferErrorCode::PcapConfigureFailed));
}

void dispatch_error_emits_event_and_updates_stats() {
    auto source = std::make_unique<FakePacketSource>();
    source->after_packets_status = PacketSourceDispatchStatus::Error;
    source->dispatch_error_status = PCAP_ERROR;
    source->dispatch_error_message = "forced dispatch failure";

    std::vector<SnifferEvent> events;
    SnifferRuntime runtime(
        base_options(),
        one_source(std::move(source)),
        SnifferOptionsValidation{.require_interface_name = false},
        [](const auto&, const auto&) {},
        [&](const SnifferEvent& event) {
            events.push_back(event);
        });

    assert(!runtime.start().has_value());
    wait_until_stopped(runtime);

    assert(has_event_code(events, SnifferErrorCode::DispatchFailed));
    const auto stats = runtime.stats();
    assert(stats.pcap_dispatch_errors == 1);
}

void stats_read_error_emits_warning_event() {
    auto source = std::make_unique<FakePacketSource>();
    source->after_packets_status = PacketSourceDispatchStatus::NoPacketsAvailable;
    source->no_packets_delay = std::chrono::milliseconds(1);
    source->stats_error = true;

    auto options = base_options();
    options.stats_poll_interval = std::chrono::milliseconds(1);

    std::vector<SnifferEvent> events;
    SnifferRuntime runtime(
        options,
        one_source(std::move(source)),
        SnifferOptionsValidation{.require_interface_name = false},
        [](const auto&, const auto&) {},
        [&](const SnifferEvent& event) {
            events.push_back(event);
        });

    assert(!runtime.start().has_value());
    std::this_thread::sleep_for(std::chrono::milliseconds(50));
    runtime.stop();

    assert(has_event_code(events, SnifferErrorCode::StatsReadFailed));
}

void packet_callback_throw_emits_fatal_event_and_stops() {
    auto source = std::make_unique<FakePacketSource>();
    source->packets.push_back(fake_packet(24));

    std::vector<SnifferEvent> events;
    SnifferRuntime runtime(
        base_options(),
        one_source(std::move(source)),
        SnifferOptionsValidation{.require_interface_name = false},
        [](const auto&, const auto&) {
            throw std::runtime_error("callback failure");
        },
        [&](const SnifferEvent& event) {
            events.push_back(event);
        });

    assert(!runtime.start().has_value());
    wait_until_stopped(runtime);

    assert(has_event_code(events, SnifferErrorCode::InternalInvariantViolation));
    assert(!runtime.is_running());
}

void event_callback_throw_does_not_crash_runtime() {
    auto source = std::make_unique<FakePacketSource>();
    source->after_packets_status = PacketSourceDispatchStatus::Error;

    std::atomic<bool> event_seen{false};
    SnifferRuntime runtime(
        base_options(),
        one_source(std::move(source)),
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
    null_packet_source_is_rejected();
    missing_packet_callback_is_rejected();
    open_failure_is_returned_from_start();
    unsupported_link_type_fails_start();
    invalid_snapshot_length_fails_start();
    ring_memory_budget_failure_closes_open_sources();
    open_warning_is_emitted_from_start();
    dispatch_error_emits_event_and_updates_stats();
    stats_read_error_emits_warning_event();
    packet_callback_throw_emits_fatal_event_and_stops();
    event_callback_throw_does_not_crash_runtime();
    return 0;
}

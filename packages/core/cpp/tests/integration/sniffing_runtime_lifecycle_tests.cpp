#include <cassert>
#include <atomic>
#include <chrono>
#include <cstdint>
#include <memory>
#include <optional>
#include <thread>
#include <utility>
#include <vector>

#include <pcap/pcap.h>

#include "pruftnet/sniffing/parsed_packet.hpp"
#include "pruftnet/sniffing/sniffer_options.hpp"
#include "sniffing/sniffer_options_validation.hpp"
#include "sniffing/sniffer_runtime.hpp"
#include "tests/support/fake_packet_source.hpp"
#include "tests/support/runtime_test_support.hpp"

namespace {

using pruftnet::sniffing::PacketFlagTruncated;
using pruftnet::sniffing::PacketKey;
using pruftnet::sniffing::EventCallback;
using pruftnet::parsing::ParseCondition;
using pruftnet::sniffing::PacketMetadata;
using pruftnet::sniffing::RawPacketView;
using pruftnet::sniffing::SnifferOptions;
using pruftnet::sniffing::internal::PacketSourceDispatchStatus;
using pruftnet::sniffing::internal::SnifferOptionsValidation;
using pruftnet::sniffing::internal::SnifferRuntime;
using pruftnet::tests::FakePacketSource;
using pruftnet::tests::fake_packet;
using pruftnet::tests::one_source;
using pruftnet::tests::single_interface_options;
using pruftnet::tests::wait_until_stopped;

SnifferOptions base_options() {
    return single_interface_options();
}

std::unique_ptr<FakePacketSource> empty_waiting_source() {
    auto source = std::make_unique<FakePacketSource>();
    source->after_packets_status = PacketSourceDispatchStatus::NoPacketsAvailable;
    source->no_packets_delay = std::chrono::milliseconds(1);
    return source;
}

void stop_before_start_and_repeated_stop_are_safe() {
    auto source = empty_waiting_source();
    SnifferRuntime runtime(
        base_options(),
        one_source(std::move(source)),
        SnifferOptionsValidation{.require_interface_name = false},
        [](const auto&, const auto&) {},
        EventCallback{});

    runtime.stop();
    runtime.stop();
    assert(!runtime.is_running());
    assert(runtime.registry_revision().is_valid());
}

void double_start_is_rejected() {
    auto source = empty_waiting_source();
    SnifferRuntime runtime(
        base_options(),
        one_source(std::move(source)),
        SnifferOptionsValidation{.require_interface_name = false},
        [](const auto&, const auto&) {},
        EventCallback{});

    assert(!runtime.start().has_value());
    assert(runtime.is_running());
    const auto second_start = runtime.start();
    assert(second_start.has_value());
    runtime.stop();
    assert(!runtime.is_running());
}

void destructor_stops_running_runtime() {
    auto source = empty_waiting_source();
    auto runtime = std::make_unique<SnifferRuntime>(
        base_options(),
        one_source(std::move(source)),
        SnifferOptionsValidation{.require_interface_name = false},
        [](const auto&, const auto&) {},
        EventCallback{});

    assert(!runtime->start().has_value());
    assert(runtime->is_running());
    runtime.reset();
}

void offline_style_empty_source_stops_at_eof() {
    auto source = std::make_unique<FakePacketSource>();
    auto* source_ptr = source.get();
    source->after_packets_status = PacketSourceDispatchStatus::EndOfInput;

    std::atomic<std::uint64_t> callbacks{0};
    SnifferRuntime runtime(
        base_options(),
        one_source(std::move(source)),
        SnifferOptionsValidation{.require_interface_name = false},
        [&](const auto&, const auto&) {
            callbacks.fetch_add(1, std::memory_order_relaxed);
        },
        {});

    assert(!runtime.start().has_value());

    wait_until_stopped(runtime);
    assert(!runtime.is_running());
    assert(callbacks.load(std::memory_order_relaxed) == 0);
    const auto stats = runtime.stats();
    assert(stats.packets_observed == 0);
    assert(stats.capture_queue_accepted == 0);
    assert(stats.packets_analyzed == 0);
    assert(source_ptr->read_stats_calls == 1);
}

void callback_can_request_stop_without_deadlock() {
    auto source = std::make_unique<FakePacketSource>();
    for (std::uint8_t index = 0; index < 10; ++index) {
        source->packets.push_back(fake_packet(32, 32, index));
    }

    SnifferRuntime* runtime_ptr = nullptr;
    std::atomic<std::uint64_t> callbacks{0};
    SnifferRuntime runtime(
        base_options(),
        one_source(std::move(source)),
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

void metadata_and_truncation_are_reported() {
    auto source = std::make_unique<FakePacketSource>();
    source->configured_link_type = DLT_EN10MB;
    source->configured_snapshot_length = 64;
    auto packet = fake_packet(16, 32, 42);
    packet.timestamp_seconds = 2;
    packet.timestamp_subseconds = 500;
    source->packets.push_back(std::move(packet));

    auto options = base_options();
    options.interfaces[0].id = 99;

    std::vector<PacketMetadata> observed;
    std::vector<ParseCondition> parse_conditions;
    std::optional<pruftnet::sniffing::ParsedPacket> retained;
    SnifferRuntime runtime(
        options,
        one_source(std::move(source)),
        SnifferOptionsValidation{.require_interface_name = false},
        [&](const RawPacketView& raw, const auto& parsed) {
            observed.push_back(raw.metadata);
            parse_conditions.push_back(parsed.condition());
            assert(parsed.packet_key() == raw.metadata.key);
            retained = parsed;
        },
        {});

    assert(!runtime.start().has_value());

    wait_until_stopped(runtime);
    assert(observed.size() == 1);
    assert(parse_conditions.size() == 1);
    assert(parse_conditions[0] == ParseCondition::Partial);
    assert(!observed[0].key.capture_id.is_nil());
    assert(observed[0].key.packet_id == 1);
    assert(observed[0].interface_id == 99);
    assert(observed[0].captured_len == 16);
    assert(observed[0].wire_len == 32);
    assert(observed[0].link_type == DLT_EN10MB);
    assert((observed[0].flags & PacketFlagTruncated) != 0);
    assert(observed[0].timestamp_ns == 2'000'500'000ULL);
    assert(retained.has_value());
    assert(retained->packet_key() == observed[0].key);
    assert(retained->source_bytes(retained->data_sources().front()).size() == observed[0].captured_len);
}

void capture_identity_changes_between_starts_and_packet_ids_restart() {
    auto source = std::make_unique<FakePacketSource>();
    source->packets.push_back(fake_packet(16));

    std::vector<PacketKey> keys;
    SnifferRuntime runtime(
        base_options(),
        one_source(std::move(source)),
        SnifferOptionsValidation{.require_interface_name = false},
        [&](const RawPacketView& raw, const auto&) {
            keys.push_back(raw.metadata.key);
        },
        {});

    assert(!runtime.capture_id().has_value());
    assert(!runtime.start().has_value());
    const auto first_capture_id = runtime.capture_id();
    assert(first_capture_id.has_value());
    const auto first_deadline = std::chrono::steady_clock::now() + std::chrono::seconds(1);
    while (runtime.is_running() && std::chrono::steady_clock::now() < first_deadline) {
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }
    assert(!runtime.is_running());

    assert(!runtime.start().has_value());
    const auto second_capture_id = runtime.capture_id();
    assert(second_capture_id.has_value());
    wait_until_stopped(runtime);
    runtime.stop();

    assert(first_capture_id != second_capture_id);
    assert(keys.size() == 2);
    assert(keys[0].capture_id == *first_capture_id);
    assert(keys[1].capture_id == *second_capture_id);
    assert(keys[0].packet_id == 1);
    assert(keys[1].packet_id == 1);
}

void capture_identity_is_safe_from_open_warning_callback() {
    auto source = std::make_unique<FakePacketSource>();
    source->packets.push_back(fake_packet(16));
    source->open_warnings.push_back(pruftnet::sniffing::SnifferEvent{});

    SnifferRuntime* runtime_ptr = nullptr;
    bool warning_received = false;
    SnifferRuntime runtime(
        base_options(),
        one_source(std::move(source)),
        SnifferOptionsValidation{.require_interface_name = false},
        [](const auto&, const auto&) {},
        [&](const auto&) {
            warning_received = true;
            assert(runtime_ptr->capture_id().has_value());
            runtime_ptr->stop();
        });
    runtime_ptr = &runtime;

    assert(!runtime.start().has_value());
    assert(warning_received);
    assert(runtime.capture_id().has_value());
    assert(!runtime.is_running());
}

void rejected_observations_leave_packet_id_gaps() {
    auto source = std::make_unique<FakePacketSource>();
    auto rejected = fake_packet(16);
    rejected.null_payload = true;
    source->packets.push_back(std::move(rejected));
    source->packets.push_back(fake_packet(16));

    std::vector<PacketKey> keys;
    SnifferRuntime runtime(
        base_options(),
        one_source(std::move(source)),
        SnifferOptionsValidation{.require_interface_name = false},
        [&](const RawPacketView& raw, const auto&) {
            keys.push_back(raw.metadata.key);
        },
        {});

    assert(!runtime.start().has_value());
    wait_until_stopped(runtime);
    assert(keys.size() == 1);
    assert(keys[0].packet_id == 2);
    const auto stats = runtime.stats();
    assert(stats.packets_observed == 2);
    assert(stats.capture_queue_accepted == 1);
    assert(stats.invalid_callback_drops == 1);
    assert(stats.packets_observed == stats.capture_queue_accepted +
                                         stats.capture_queue_full_drops +
                                         stats.capture_queue_oversize_drops +
                                         stats.invalid_callback_drops);
}

} // namespace

int main() {
    stop_before_start_and_repeated_stop_are_safe();
    double_start_is_rejected();
    destructor_stops_running_runtime();
    offline_style_empty_source_stops_at_eof();
    callback_can_request_stop_without_deadlock();
    metadata_and_truncation_are_reported();
    capture_identity_changes_between_starts_and_packet_ids_restart();
    capture_identity_is_safe_from_open_warning_callback();
    rejected_observations_leave_packet_id_gaps();
    return 0;
}

#include <cassert>
#include <atomic>
#include <chrono>
#include <cstdint>
#include <memory>
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
using pruftnet::sniffing::EventCallback;
using pruftnet::sniffing::ParseStatus;
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
    assert(stats.packets_seen == 0);
    assert(stats.packets_enqueued == 0);
    assert(stats.packets_parsed == 0);
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

    std::vector<RawPacketView> observed;
    std::vector<ParseStatus> parse_statuses;
    SnifferRuntime runtime(
        options,
        one_source(std::move(source)),
        SnifferOptionsValidation{.require_interface_name = false},
        [&](const RawPacketView& raw, const auto& parsed) {
            observed.push_back(raw);
            parse_statuses.push_back(parsed.status);
        },
        {});

    assert(!runtime.start().has_value());

    wait_until_stopped(runtime);
    assert(observed.size() == 1);
    assert(parse_statuses.size() == 1);
    assert(parse_statuses[0] == ParseStatus::NotParsed);
    assert(observed[0].metadata.sequence == 1);
    assert(observed[0].metadata.interface_id == 99);
    assert(observed[0].metadata.captured_len == 16);
    assert(observed[0].metadata.wire_len == 32);
    assert(observed[0].metadata.link_type == DLT_EN10MB);
    assert((observed[0].metadata.flags & PacketFlagTruncated) != 0);
    assert(observed[0].metadata.timestamp_ns == 2'000'500'000ULL);
}

} // namespace

int main() {
    stop_before_start_and_repeated_stop_are_safe();
    double_start_is_rejected();
    destructor_stops_running_runtime();
    offline_style_empty_source_stops_at_eof();
    callback_can_request_stop_without_deadlock();
    metadata_and_truncation_are_reported();
    return 0;
}

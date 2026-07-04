#include <cassert>
#include <chrono>
#include <cstdint>
#include <filesystem>
#include <iostream>
#include <memory>
#include <string>
#include <thread>
#include <utility>
#include <vector>

#include "pruftnet/sniffing/sniffer_error.hpp"
#include "pruftnet/sniffing/sniffer_event.hpp"
#include "pruftnet/sniffing/sniffer_options.hpp"
#include "sniffing/offline_pcap_packet_source.hpp"
#include "sniffing/sniffer_options_validation.hpp"
#include "sniffing/sniffer_runtime.hpp"
#include "tests/test_config.hpp"
#include "tests/support/runtime_test_support.hpp"

namespace {

using pruftnet::sniffing::SnifferErrorCode;
using pruftnet::sniffing::SnifferEvent;
using pruftnet::sniffing::SnifferInterfaceOptions;
using pruftnet::sniffing::SnifferOptions;
using pruftnet::sniffing::SnifferSeverity;
using pruftnet::sniffing::internal::OfflinePcapPacketSource;
using pruftnet::sniffing::internal::SnifferOptionsValidation;
using pruftnet::sniffing::internal::SnifferRuntime;

bool has_error_event(const std::vector<SnifferEvent>& events) {
    for (const auto& event : events) {
        if (event.severity == SnifferSeverity::Error || event.severity == SnifferSeverity::Fatal) {
            return true;
        }
    }
    return false;
}

std::uint64_t run_filter(const std::filesystem::path& fixture, std::string filter, std::uint64_t expected_packets) {
    SnifferOptions options;
    SnifferInterfaceOptions interface_options;
    interface_options.id = 0;
    interface_options.bpf_filter = std::move(filter);
    interface_options.ring_slots = 32;
    interface_options.pcap_dispatch_batch_size = 4;
    options.interfaces.push_back(interface_options);
    options.stats_poll_interval = std::chrono::milliseconds(0);

    std::uint64_t callback_count = 0;
    std::vector<SnifferEvent> events;
    SnifferRuntime runtime(
        options,
        pruftnet::tests::one_source(std::make_unique<OfflinePcapPacketSource>(fixture.string(), interface_options)),
        SnifferOptionsValidation{.require_interface_name = false},
        [&](const auto&, const auto&, const auto&) {
            ++callback_count;
        },
        [&](const SnifferEvent& event) {
            events.push_back(event);
        });

    if (const auto error = runtime.start()) {
        std::cerr << "unexpected start error: " << error->message << '\n';
        return UINT64_MAX;
    }

    const auto deadline = std::chrono::steady_clock::now() + std::chrono::seconds(1);
    while (runtime.is_running() && std::chrono::steady_clock::now() < deadline) {
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }

    runtime.stop();

    assert(!runtime.is_running());
    assert(!has_error_event(events));
    assert(callback_count == expected_packets);
    const auto stats = runtime.stats();
    assert(stats.packets_seen == expected_packets);
    assert(stats.packets_enqueued == expected_packets);
    assert(stats.packets_parsed == expected_packets);
    assert(stats.app_ring_drops == 0);
    return callback_count;
}

void invalid_filter_fails_at_start(const std::filesystem::path& fixture) {
    SnifferOptions options;
    SnifferInterfaceOptions interface_options;
    interface_options.bpf_filter = "tcp and";
    options.interfaces.push_back(interface_options);

    SnifferRuntime runtime(
        options,
        pruftnet::tests::one_source(std::make_unique<OfflinePcapPacketSource>(fixture.string(), interface_options)),
        SnifferOptionsValidation{.require_interface_name = false},
        [](const auto&, const auto&, const auto&) {},
        {});

    const auto error = runtime.start();
    assert(error.has_value());
    assert(error->code == SnifferErrorCode::FilterCompileFailed);
}

} // namespace

int main() {
    const auto fixture = pruftnet::tests::fixture_path("ethernet_ipv4_tcp_udp.pcap");
    assert(std::filesystem::exists(fixture));

    assert(run_filter(fixture, "", 10) == 10);
    assert(run_filter(fixture, "udp", 5) == 5);
    assert(run_filter(fixture, "tcp", 5) == 5);
    assert(run_filter(fixture, "port 8080", 5) == 5);
    assert(run_filter(fixture, "icmp", 0) == 0);
    invalid_filter_fails_at_start(fixture);
    return 0;
}

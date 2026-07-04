#include <atomic>
#include <chrono>
#include <cstddef>
#include <cstdint>
#include <iostream>
#include <thread>
#include <utility>

#include "pruftnet/sniffing/network_sniffer.hpp"
#include "tests/test_config.hpp"

int main() {
    using namespace pruftnet::sniffing;

    const auto interface_name = pruftnet::tests::live_interface_name();
    if (!interface_name.has_value()) {
        std::cerr << "Skipping live sniffing test because PRUFTNET_TEST_INTERFACE is not set.\n";
        return pruftnet::tests::kSkipExitCode;
    }

    SnifferOptions options;
    SnifferInterfaceOptions interface_options;
    interface_options.name = *interface_name;
    interface_options.promiscuous = false;
    interface_options.ring_slots = 4096;
    options.interfaces.push_back(std::move(interface_options));

    std::atomic<std::uint64_t> packet_count{0};
    std::atomic<std::uint64_t> event_errors{0};
    std::atomic<bool> invalid_packet{false};

    NetworkSniffer sniffer(
        options,
        [&](const RawPacketView& raw, const ParsedPacket& parsed, const SnifferStatsSnapshot& stats) {
            if (raw.bytes.empty() || raw.metadata.captured_len != raw.bytes.size() ||
                raw.metadata.wire_len < raw.metadata.captured_len || parsed.status != ParseStatus::NotParsed ||
                stats.packets_seen == 0 || stats.packets_enqueued == 0 || stats.packets_parsed == 0) {
                invalid_packet.store(true, std::memory_order_relaxed);
            }

            packet_count.fetch_add(1, std::memory_order_relaxed);
        },
        [&](const SnifferEvent& event) {
            if (event.severity == SnifferSeverity::Error || event.severity == SnifferSeverity::Fatal) {
                event_errors.fetch_add(1, std::memory_order_relaxed);
                std::cerr << '[' << to_string(event.severity) << "] " << to_string(event.code) << ": "
                          << event.message << '\n';
            }
        });

    if (const auto error = sniffer.start()) {
        std::cerr << '[' << to_string(error->severity) << "] " << to_string(error->code) << ": "
                  << error->message << '\n';
        return 1;
    }

    const auto deadline = std::chrono::steady_clock::now() + pruftnet::tests::kLiveSniffingTimeout;
    while (packet_count.load(std::memory_order_relaxed) < pruftnet::tests::kLivePacketsToCapture &&
           sniffer.is_running() && std::chrono::steady_clock::now() < deadline) {
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
    }

    sniffer.stop();

    if (event_errors.load(std::memory_order_relaxed) != 0 || invalid_packet.load(std::memory_order_relaxed)) {
        return 1;
    }

    if (packet_count.load(std::memory_order_relaxed) < pruftnet::tests::kLivePacketsToCapture) {
        std::cerr << "Timed out waiting for " << pruftnet::tests::kLivePacketsToCapture << " packets on "
                  << *interface_name << ".\n";
        return 1;
    }

    const auto stats = sniffer.stats();
    if (stats.packets_seen < pruftnet::tests::kLivePacketsToCapture ||
        stats.packets_enqueued < pruftnet::tests::kLivePacketsToCapture ||
        stats.packets_parsed < pruftnet::tests::kLivePacketsToCapture) {
        return 1;
    }

    return 0;
}

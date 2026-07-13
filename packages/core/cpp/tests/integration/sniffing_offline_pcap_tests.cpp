#include <array>
#include <cassert>
#include <chrono>
#include <cstddef>
#include <cstdint>
#include <filesystem>
#include <iostream>
#include <memory>
#include <thread>
#include <vector>

#include <pcap/pcap.h>

#include "pruftnet/sniffing/parsed_packet.hpp"
#include "pruftnet/sniffing/sniffer_error.hpp"
#include "pruftnet/sniffing/sniffer_options.hpp"
#include "sniffing/offline_pcap_packet_source.hpp"
#include "sniffing/sniffer_options_validation.hpp"
#include "sniffing/sniffer_runtime.hpp"
#include "tests/test_config.hpp"
#include "tests/support/runtime_test_support.hpp"

namespace {

struct ObservedPacket {
    pruftnet::sniffing::PacketMetadata metadata;
    pruftnet::parsing::ParseCondition parse_condition = pruftnet::parsing::ParseCondition::Malformed;
    pruftnet::parsing::RegistryRevision registry_revision;
    std::size_t node_count = 0;
    std::size_t byte_count = 0;
};

bool has_error_severity(const std::vector<pruftnet::sniffing::SnifferEvent>& events) {
    for (const auto& event : events) {
        if (event.severity == pruftnet::sniffing::SnifferSeverity::Error ||
            event.severity == pruftnet::sniffing::SnifferSeverity::Fatal) {
            return true;
        }
    }
    return false;
}

} // namespace

int main() {
    using namespace pruftnet::sniffing;
    using namespace pruftnet::sniffing::internal;

    const auto fixture = pruftnet::tests::fixture_path("ethernet_ipv4_tcp_udp.pcap");
    assert(std::filesystem::exists(fixture));

    SnifferOptions options;
    SnifferInterfaceOptions interface_options;
    interface_options.id = 7;
    interface_options.ring_slots = 32;
    interface_options.pcap_dispatch_batch_size = 4;
    options.interfaces.push_back(interface_options);
    options.stats_poll_interval = std::chrono::milliseconds(0);

    std::vector<ObservedPacket> observed;
    std::vector<SnifferEvent> events;

    SnifferRuntime runtime(
        options,
        pruftnet::tests::one_source(std::make_unique<OfflinePcapPacketSource>(fixture.string(), interface_options)),
        SnifferOptionsValidation{.require_interface_name = false},
        [&](const RawPacketView& raw, const ParsedPacket& parsed) {
            observed.push_back(ObservedPacket{raw.metadata, parsed.condition(), parsed.registry_revision(),
                                              parsed.nodes().size(), raw.bytes.size()});
            assert(parsed.packet_key() == raw.metadata.key);
        },
        [&](const SnifferEvent& event) {
            events.push_back(event);
        });

    if (const auto error = runtime.start()) {
        std::cerr << to_string(error->code) << ": " << error->message << '\n';
        return 1;
    }

    const auto deadline = std::chrono::steady_clock::now() + pruftnet::tests::kOfflineSniffingTimeout;
    while (runtime.is_running() && std::chrono::steady_clock::now() < deadline) {
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }

    runtime.stop();

    assert(!runtime.is_running());
    assert(!has_error_severity(events));
    assert(observed.size() == pruftnet::tests::kOfflineExpectedPacketCount);

    constexpr std::array<std::uint32_t, 10> kExpectedLengths = {60, 60, 60, 60, 60, 54, 54, 54, 70, 54};

    std::uint64_t previous_timestamp = 0;
    for (std::size_t index = 0; index < observed.size(); ++index) {
        const auto& packet = observed[index];
        assert(packet.metadata.key.capture_id == observed.front().metadata.key.capture_id);
        assert(packet.metadata.key.packet_id == index + 1);
        assert(packet.metadata.interface_id == 7);
        assert(packet.metadata.link_type == DLT_EN10MB);
        assert(packet.metadata.captured_len == kExpectedLengths[index]);
        assert(packet.metadata.wire_len == kExpectedLengths[index]);
        assert(packet.byte_count == kExpectedLengths[index]);
        assert(packet.parse_condition == pruftnet::parsing::ParseCondition::Complete);
        assert(packet.registry_revision == runtime.registry_revision());
        assert(packet.node_count > 4);
        assert((packet.metadata.flags & PacketFlagTruncated) == 0);
        assert(packet.metadata.timestamp_ns >= previous_timestamp);
        previous_timestamp = packet.metadata.timestamp_ns;
    }

    const auto stats = runtime.stats();
    assert(stats.packets_observed == pruftnet::tests::kOfflineExpectedPacketCount);
    assert(stats.capture_queue_accepted == pruftnet::tests::kOfflineExpectedPacketCount);
    assert(stats.packets_analyzed == pruftnet::tests::kOfflineExpectedPacketCount);
    assert(stats.capture_queue_full_drops == 0);
    assert(stats.pcap_dispatch_calls >= 1);
    assert(stats.pcap_dispatch_errors == 0);
    assert(stats.capture_queue_depth == 0);
    assert(stats.capture_queue_capacity_packets == 32);
    assert(stats.capture_queue_accepted ==
           stats.packets_persisted + stats.capture_queue_depth +
               stats.writer_in_flight + stats.terminal_write_losses);
    assert(stats.packets_persisted ==
           stats.packets_analyzed + stats.analysis_backlog_packets +
               stats.analysis_evicted_before_analysis + stats.analysis_rejects);
    assert(stats.analysis_backlog_packets == 0);
    assert(stats.analysis_backlog_bytes == 0);
    assert(stats.writer_in_flight == 0);

    return 0;
}

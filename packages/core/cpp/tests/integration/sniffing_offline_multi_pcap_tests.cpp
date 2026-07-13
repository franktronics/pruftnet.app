#include <array>
#include <cassert>
#include <chrono>
#include <cstdint>
#include <filesystem>
#include <memory>
#include <thread>
#include <vector>

#include "pruftnet/sniffing/sniffer_options.hpp"
#include "pruftnet/sniffing/sniffer_stats.hpp"
#include "sniffing/offline_pcap_packet_source.hpp"
#include "sniffing/packet_source.hpp"
#include "sniffing/sniffer_options_validation.hpp"
#include "sniffing/sniffer_runtime.hpp"
#include "tests/test_config.hpp"
#include "tests/support/runtime_test_support.hpp"

namespace {

using pruftnet::sniffing::InterfaceStatsSnapshot;
using pruftnet::sniffing::RawPacketView;
using pruftnet::sniffing::SnifferInterfaceOptions;
using pruftnet::sniffing::SnifferOptions;
using pruftnet::sniffing::internal::OfflinePcapPacketSource;
using pruftnet::sniffing::internal::PacketSource;
using pruftnet::sniffing::internal::SnifferOptionsValidation;
using pruftnet::sniffing::internal::SnifferRuntime;

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

} // namespace

int main() {
    const auto fixture = pruftnet::tests::fixture_path("ethernet_ipv4_tcp_udp.pcap");
    assert(std::filesystem::exists(fixture));

    SnifferInterfaceOptions udp_interface;
    udp_interface.id = 101;
    udp_interface.bpf_filter = "udp";
    udp_interface.ring_slots = 32;
    udp_interface.pcap_dispatch_batch_size = 4;

    SnifferInterfaceOptions tcp_interface;
    tcp_interface.id = 202;
    tcp_interface.bpf_filter = "tcp";
    tcp_interface.ring_slots = 32;
    tcp_interface.pcap_dispatch_batch_size = 4;

    SnifferOptions options;
    options.interfaces.push_back(udp_interface);
    options.interfaces.push_back(tcp_interface);
    options.stats_poll_interval = std::chrono::milliseconds(0);

    std::vector<std::unique_ptr<PacketSource>> sources;
    sources.push_back(std::make_unique<OfflinePcapPacketSource>(fixture.string(), udp_interface));
    sources.push_back(std::make_unique<OfflinePcapPacketSource>(fixture.string(), tcp_interface));

    std::array<std::uint64_t, 2> callbacks_by_interface = {0, 0};
    SnifferRuntime runtime(
        options,
        std::move(sources),
        SnifferOptionsValidation{.require_interface_name = false},
        [&](const RawPacketView& raw, const auto&) {
            if (raw.metadata.interface_id == 101) {
                ++callbacks_by_interface[0];
            } else if (raw.metadata.interface_id == 202) {
                ++callbacks_by_interface[1];
            } else {
                assert(false);
            }
        },
        {});

    assert(!runtime.start().has_value());
    pruftnet::tests::wait_until_stopped(runtime, pruftnet::tests::kOfflineSniffingTimeout);

    assert(callbacks_by_interface[0] == 5);
    assert(callbacks_by_interface[1] == 5);

    const auto stats = runtime.stats();
    assert(stats.packets_observed == 10);
    assert(stats.capture_queue_accepted == 10);
    assert(stats.packets_analyzed == 10);
    assert(stats.interfaces.size() == 2);

    const auto* udp_stats = find_interface_stats(stats, 101);
    const auto* tcp_stats = find_interface_stats(stats, 202);
    assert(udp_stats != nullptr);
    assert(tcp_stats != nullptr);
    assert(udp_stats->packets_observed == 5);
    assert(udp_stats->capture_queue_accepted == 5);
    assert(tcp_stats->packets_observed == 5);
    assert(tcp_stats->capture_queue_accepted == 5);

    return 0;
}

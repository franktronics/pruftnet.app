#include <array>
#include <chrono>
#include <cstddef>
#include <cstdint>
#include <iostream>
#include <memory>
#include <vector>

#include "pruftnet/sniffing/sniffer_options.hpp"
#include "sniffing/packet_ring.hpp"
#include "sniffing/sniffer_options_validation.hpp"
#include "sniffing/sniffer_runtime.hpp"
#include "tests/support/fake_packet_source.hpp"
#include "tests/support/runtime_test_support.hpp"

namespace {

using clock_type = std::chrono::steady_clock;

double seconds_between(clock_type::time_point start, clock_type::time_point end) {
    return std::chrono::duration<double>(end - start).count();
}

void benchmark_packet_ring() {
    pruftnet::sniffing::internal::PacketRing ring(4096, 64);
    const auto bytes = pruftnet::tests::fake_packet_bytes(64);
    pruftnet::sniffing::PacketMetadata metadata;

    constexpr std::uint64_t kIterations = 1'000'000;
    std::uint64_t pushed = 0;
    const auto start = clock_type::now();
    while (pushed < kIterations) {
        metadata.key.packet_id = pushed + 1;
        if (ring.try_push(metadata, bytes)) {
            ++pushed;
        }
        if (ring.depth() >= 2048) {
            while (!ring.empty()) {
                ring.pop();
            }
        }
    }
    while (!ring.empty()) {
        ring.pop();
    }
    const auto elapsed = seconds_between(start, clock_type::now());
    std::cout << "packet_ring_push_pop packets=" << pushed << " seconds=" << elapsed
              << " packets_per_second=" << static_cast<double>(pushed) / elapsed << '\n';
}

std::unique_ptr<pruftnet::tests::FakePacketSource> benchmark_source(std::uint32_t packet_count, std::uint8_t seed) {
    auto source = std::make_unique<pruftnet::tests::FakePacketSource>();
    source->configured_snapshot_length = 128;
    source->packets.reserve(packet_count);
    for (std::uint32_t index = 0; index < packet_count; ++index) {
        source->packets.push_back(pruftnet::tests::fake_packet(96, 96, static_cast<std::uint8_t>(seed + index)));
    }
    return source;
}

void benchmark_runtime() {
    constexpr std::uint32_t kPacketsPerInterface = 50'000;

    pruftnet::sniffing::SnifferOptions options;
    options.interfaces.push_back(pruftnet::tests::test_interface_options(1));
    options.interfaces.push_back(pruftnet::tests::test_interface_options(2));
    options.interfaces[0].ring_slots = kPacketsPerInterface;
    options.interfaces[1].ring_slots = kPacketsPerInterface;
    options.interfaces[0].pcap_dispatch_batch_size = 256;
    options.interfaces[1].pcap_dispatch_batch_size = 256;
    options.stats_poll_interval = std::chrono::milliseconds(0);

    std::vector<std::unique_ptr<pruftnet::sniffing::internal::PacketSource>> sources;
    sources.push_back(benchmark_source(kPacketsPerInterface, 1));
    sources.push_back(benchmark_source(kPacketsPerInterface, 17));

    std::uint64_t callbacks = 0;
    pruftnet::sniffing::internal::SnifferRuntime runtime(
        options,
        std::move(sources),
        pruftnet::sniffing::internal::SnifferOptionsValidation{.require_interface_name = false},
        [&](const auto&, const auto&) {
            ++callbacks;
        },
        {});

    const auto start = clock_type::now();
    if (const auto error = runtime.start()) {
        std::cerr << "runtime benchmark failed to start: " << error->message << '\n';
        return;
    }

    pruftnet::tests::wait_until_stopped(runtime, std::chrono::seconds(10));
    const auto elapsed = seconds_between(start, clock_type::now());
    std::cout << "runtime_fake_multi_interface packets=" << callbacks << " seconds=" << elapsed
              << " packets_per_second=" << static_cast<double>(callbacks) / elapsed << '\n';
}

} // namespace

int main() {
    benchmark_packet_ring();
    benchmark_runtime();
    return 0;
}

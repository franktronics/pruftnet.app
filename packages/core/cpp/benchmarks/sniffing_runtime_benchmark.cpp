#include <array>
#include <chrono>
#include <cstddef>
#include <cstdint>
#include <iostream>
#include <memory>
#include <filesystem>
#include <algorithm>
#include <numeric>
#include <vector>

#include "pruftnet/capture/pcapng_spool.hpp"
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

void benchmark_packet_ring(std::size_t packet_bytes, std::uint64_t iterations) {
    pruftnet::sniffing::internal::PacketRing ring(4096, 4096 * packet_bytes, packet_bytes);
    const auto bytes = pruftnet::tests::fake_packet_bytes(packet_bytes);
    pruftnet::sniffing::PacketMetadata metadata;

    std::uint64_t pushed = 0;
    std::size_t maximum_depth = 0;
    const auto start = clock_type::now();
    while (pushed < iterations) {
        metadata.key.packet_id = pushed + 1;
        if (ring.try_push(metadata, bytes) ==
            pruftnet::sniffing::internal::PacketRingPushResult::Accepted) {
            ++pushed;
            maximum_depth = std::max(maximum_depth, ring.depth());
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
    std::cout << "capture_queue packet_bytes=" << packet_bytes << " packets=" << pushed
              << " seconds=" << elapsed
              << " packets_per_second=" << static_cast<double>(pushed) / elapsed
              << " bytes_per_second=" << static_cast<double>(pushed * packet_bytes) / elapsed
              << " max_depth=" << maximum_depth << '\n';
}

void benchmark_spool(std::size_t packet_bytes, std::uint64_t packets) {
    auto directory = std::filesystem::temp_directory_path() / "pruftnet-spool-benchmark";
    std::error_code error;
    std::filesystem::remove_all(directory, error);
    pruftnet::capture::PcapngSpoolOptions options;
    options.directory = directory;
    options.temporary = false;
    options.flush_bytes = 1024 * 1024;
    options.flush_interval = std::chrono::hours(1);
    const pruftnet::sniffing::CaptureId capture_id{1, packet_bytes};
    auto created = pruftnet::capture::PcapngSpool::create(
        options, capture_id, {{0, "benchmark0", 1, 65535, 9}});
    auto spool = std::move(std::get<std::unique_ptr<pruftnet::capture::PcapngSpool>>(created));
    const auto bytes = pruftnet::tests::fake_packet_bytes(packet_bytes);
    std::vector<clock_type::time_point> accepted_at(packets + 1);
    std::vector<double> commit_latency_us;
    commit_latency_us.reserve(packets);
    const auto publish = [&](const std::vector<pruftnet::capture::CommittedPacket>& committed) {
        const auto now = clock_type::now();
        for (const auto& packet : committed)
            commit_latency_us.push_back(std::chrono::duration<double, std::micro>(
                                            now - accepted_at[packet.metadata.key.packet_id])
                                            .count());
    };
    const auto start = clock_type::now();
    for (std::uint64_t packet_id = 1; packet_id <= packets; ++packet_id) {
        pruftnet::sniffing::PacketMetadata metadata;
        metadata.key = {capture_id, packet_id};
        metadata.timestamp_ns = packet_id;
        metadata.captured_len = packet_bytes;
        metadata.wire_len = packet_bytes;
        metadata.link_type = 1;
        accepted_at[packet_id] = clock_type::now();
        if (const auto append_error = spool->append(metadata, bytes)) {
            std::cerr << "spool benchmark append failed: " << append_error->message << '\n';
            return;
        }
        const auto flushed = spool->flush_if_due();
        if (const auto* flush_error = std::get_if<pruftnet::capture::SpoolError>(&flushed)) {
            std::cerr << "spool benchmark flush failed: " << flush_error->message << '\n';
            return;
        }
        publish(std::get<std::vector<pruftnet::capture::CommittedPacket>>(flushed));
    }
    const auto finalized = spool->finalize();
    if (const auto* finalize_error = std::get_if<pruftnet::capture::SpoolError>(&finalized)) {
        std::cerr << "spool benchmark finalize failed: " << finalize_error->message << '\n';
        return;
    }
    publish(std::get<std::vector<pruftnet::capture::CommittedPacket>>(finalized));
    const auto elapsed = seconds_between(start, clock_type::now());
    const auto stats = spool->stats();
    std::sort(commit_latency_us.begin(), commit_latency_us.end());
    const auto latency_sum = std::accumulate(commit_latency_us.begin(), commit_latency_us.end(), 0.0);
    const auto p99_index = commit_latency_us.empty()
        ? 0
        : std::min(commit_latency_us.size() - 1,
                   static_cast<std::size_t>(commit_latency_us.size() * 0.99));
    const auto payload_bytes = packets * packet_bytes;
    std::cout << "pcapng_spool packet_bytes=" << packet_bytes << " packets=" << packets
              << " seconds=" << elapsed
              << " packets_per_second=" << static_cast<double>(packets) / elapsed
              << " bytes_per_second=" << static_cast<double>(payload_bytes) / elapsed
              << " average_commit_latency_us="
              << (commit_latency_us.empty() ? 0 : latency_sum / commit_latency_us.size())
              << " p99_commit_latency_us="
              << (commit_latency_us.empty() ? 0 : commit_latency_us[p99_index])
              << " write_amplification="
              << (payload_bytes == 0 ? 0 : static_cast<double>(stats.bytes_written) / payload_bytes)
              << '\n';
    spool.reset();
    std::filesystem::remove_all(directory, error);
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
    options.interfaces[0].ring_bytes = kPacketsPerInterface * 128;
    options.interfaces[1].ring_bytes = kPacketsPerInterface * 128;
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
              << " packets_per_second=" << static_cast<double>(callbacks) / elapsed;
    const auto stats = runtime.stats();
    std::cout << " persisted=" << stats.packets_persisted
              << " analyzed=" << stats.packets_analyzed
              << " queue_max_packets=" << stats.capture_queue_max_depth
              << " queue_max_bytes=" << stats.capture_queue_max_bytes
              << " queue_full_drops=" << stats.capture_queue_full_drops
              << " analysis_backlog=" << stats.analysis_backlog_packets << '\n';
}

} // namespace

int main() {
    benchmark_packet_ring(64, 1'000'000);
    benchmark_packet_ring(1514, 250'000);
    benchmark_spool(64, 100'000);
    benchmark_spool(1514, 20'000);
    benchmark_runtime();
    return 0;
}

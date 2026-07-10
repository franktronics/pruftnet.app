#include <chrono>
#include <cstddef>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <functional>
#include <iostream>
#include <span>
#include <stdexcept>
#include <string>
#include <vector>

#include "benchmarks/packet_codec/custom_packet_codec.hpp"
#include "benchmarks/packet_codec/flatbuffers_packet_codec.hpp"
#include "benchmarks/packet_codec/packet_codec_model.hpp"

namespace {

using pruftnet::benchmarks::packet_codec::SelectedPacketView;
using pruftnet::benchmarks::packet_codec::SummaryBatch;
using clock_type = std::chrono::steady_clock;

struct Measurement {
    double seconds = 0;
    std::uint64_t checksum = 0;
};

template <typename Function> Measurement measure(std::size_t iterations, Function&& function) {
    std::uint64_t checksum = 0;
    const auto start = clock_type::now();
    for (std::size_t index = 0; index < iterations; ++index) {
        checksum += static_cast<std::uint64_t>(std::invoke(function));
    }
    const auto elapsed = std::chrono::duration<double>(clock_type::now() - start).count();
    return {.seconds = elapsed, .checksum = checksum};
}

void print_metric(std::string_view codec, std::string_view operation, std::string_view workload, std::size_t items,
                  std::size_t bytes, std::size_t iterations, const Measurement& measurement, std::size_t allocations) {
    std::cout << "metric"
              << " stage=cpp"
              << " codec=" << codec << " operation=" << operation << " workload=" << workload << " items=" << items
              << " bytes=" << bytes << " iterations=" << iterations << " seconds=" << measurement.seconds
              << " ops_per_second=" << static_cast<double>(iterations) / measurement.seconds
              << " checksum=" << measurement.checksum << " allocations=" << allocations << '\n';
}

void write_artifact(const std::filesystem::path& path, std::span<const std::byte> bytes) {
    std::ofstream output(path, std::ios::binary | std::ios::trunc);
    if (!output) {
        throw std::runtime_error("failed to open benchmark artifact: " + path.string());
    }
    output.write(reinterpret_cast<const char*>(bytes.data()), static_cast<std::streamsize>(bytes.size()));
    if (!output) {
        throw std::runtime_error("failed to write benchmark artifact: " + path.string());
    }
}

std::size_t summary_iterations(std::size_t packet_count) {
    if (packet_count <= 64U) {
        return 5'000;
    }
    if (packet_count <= 1'024U) {
        return 500;
    }
    return 50;
}

std::size_t detail_iterations(std::size_t node_count) {
    if (node_count <= 32U) {
        return 10'000;
    }
    if (node_count <= 256U) {
        return 2'000;
    }
    return 200;
}

void benchmark_summary(std::size_t packet_count, const std::filesystem::path& artifact_directory, bool write_output) {
    using namespace pruftnet::benchmarks::packet_codec;
    const SummaryBatch batch = make_summary_batch(packet_count);
    const auto custom = encode_custom(batch);
    const auto flatbuffers = encode_flatbuffers(batch);
    const auto flatbuffer_allocations = last_flatbuffers_allocation_count();
    const auto custom_checksum = traverse_custom(custom);
    const auto flatbuffers_checksum = traverse_flatbuffers(flatbuffers);
    if (custom_checksum != flatbuffers_checksum) {
        throw std::runtime_error("summary codec checksum mismatch");
    }

    auto truncated_custom = custom;
    truncated_custom.pop_back();
    auto truncated_flatbuffers = flatbuffers;
    truncated_flatbuffers.pop_back();
    if (verify_custom(truncated_custom) || verify_flatbuffers(truncated_flatbuffers)) {
        throw std::runtime_error("summary codec accepted a truncated buffer");
    }

    const auto iterations = summary_iterations(packet_count);
    const auto custom_encode = measure(iterations, [&] { return encode_custom(batch).size(); });
    const auto flatbuffers_encode = measure(iterations, [&] { return encode_flatbuffers(batch).size(); });
    const auto custom_decode = measure(iterations, [&] { return traverse_custom(custom); });
    const auto flatbuffers_decode = measure(iterations, [&] { return traverse_flatbuffers(flatbuffers); });

    print_metric("custom", "encode", "summary", packet_count, custom.size(), iterations, custom_encode, 1);
    print_metric("flatbuffers", "encode", "summary", packet_count, flatbuffers.size(), iterations, flatbuffers_encode,
                 flatbuffer_allocations);
    print_metric("custom", "decode", "summary", packet_count, custom.size(), iterations, custom_decode, 0);
    print_metric("flatbuffers", "decode", "summary", packet_count, flatbuffers.size(), iterations, flatbuffers_decode,
                 0);

    if (write_output) {
        write_artifact(artifact_directory / "summary-custom.bin", custom);
        write_artifact(artifact_directory / "summary-flatbuffers.bin", flatbuffers);
    }
}

void benchmark_detail(std::size_t node_count, const std::filesystem::path& artifact_directory, bool write_output) {
    using namespace pruftnet::benchmarks::packet_codec;
    const SelectedPacketView detail = make_selected_packet_view(node_count);
    const auto custom = encode_custom(detail);
    const auto flatbuffers = encode_flatbuffers(detail);
    const auto flatbuffer_allocations = last_flatbuffers_allocation_count();
    const auto custom_checksum = traverse_custom(custom);
    const auto flatbuffers_checksum = traverse_flatbuffers(flatbuffers);
    if (custom_checksum != flatbuffers_checksum) {
        throw std::runtime_error("detail codec checksum mismatch");
    }

    auto truncated_custom = custom;
    truncated_custom.pop_back();
    auto truncated_flatbuffers = flatbuffers;
    truncated_flatbuffers.pop_back();
    if (verify_custom(truncated_custom) || verify_flatbuffers(truncated_flatbuffers)) {
        throw std::runtime_error("detail codec accepted a truncated buffer");
    }

    const auto iterations = detail_iterations(node_count);
    const auto custom_encode = measure(iterations, [&] { return encode_custom(detail).size(); });
    const auto flatbuffers_encode = measure(iterations, [&] { return encode_flatbuffers(detail).size(); });
    const auto custom_decode = measure(iterations, [&] { return traverse_custom(custom); });
    const auto flatbuffers_decode = measure(iterations, [&] { return traverse_flatbuffers(flatbuffers); });

    print_metric("custom", "encode", "detail", node_count, custom.size(), iterations, custom_encode, 1);
    print_metric("flatbuffers", "encode", "detail", node_count, flatbuffers.size(), iterations, flatbuffers_encode,
                 flatbuffer_allocations);
    print_metric("custom", "decode", "detail", node_count, custom.size(), iterations, custom_decode, 0);
    print_metric("flatbuffers", "decode", "detail", node_count, flatbuffers.size(), iterations, flatbuffers_decode, 0);

    if (write_output) {
        write_artifact(artifact_directory / "detail-custom.bin", custom);
        write_artifact(artifact_directory / "detail-flatbuffers.bin", flatbuffers);
    }
}

} // namespace

int main(int argc, char** argv) {
    try {
        const std::filesystem::path artifact_directory = argc > 1 ? argv[1] : "packet-codec-artifacts";
        std::filesystem::create_directories(artifact_directory);

        for (const auto packet_count : {64U, 1'024U, 8'192U}) {
            benchmark_summary(packet_count, artifact_directory, packet_count == 8'192U);
        }
        for (const auto node_count : {32U, 256U, 2'048U}) {
            benchmark_detail(node_count, artifact_directory, node_count == 2'048U);
        }
        std::cout << "artifacts directory=" << std::filesystem::absolute(artifact_directory).string() << '\n';
        return 0;
    } catch (const std::exception& error) {
        std::cerr << "packet codec benchmark failed: " << error.what() << '\n';
        return 1;
    }
}

#pragma once

#include <cstddef>
#include <cstdint>
#include <span>
#include <vector>

#include "benchmarks/packet_codec/packet_codec_model.hpp"

namespace pruftnet::benchmarks::packet_codec {

std::vector<std::byte> encode_flatbuffers(const SummaryBatch& batch);
std::vector<std::byte> encode_flatbuffers(const SelectedPacketView& detail);

bool verify_flatbuffers(std::span<const std::byte> bytes) noexcept;
std::uint64_t traverse_flatbuffers(std::span<const std::byte> bytes);
std::size_t last_flatbuffers_allocation_count() noexcept;

} // namespace pruftnet::benchmarks::packet_codec

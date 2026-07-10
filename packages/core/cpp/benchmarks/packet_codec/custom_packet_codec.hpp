#pragma once

#include <cstddef>
#include <cstdint>
#include <span>
#include <vector>

#include "benchmarks/packet_codec/packet_codec_model.hpp"

namespace pruftnet::benchmarks::packet_codec {

std::vector<std::byte> encode_custom(const SummaryBatch& batch);
std::vector<std::byte> encode_custom(const SelectedPacketView& detail);

bool verify_custom(std::span<const std::byte> bytes) noexcept;
std::uint64_t traverse_custom(std::span<const std::byte> bytes);

} // namespace pruftnet::benchmarks::packet_codec

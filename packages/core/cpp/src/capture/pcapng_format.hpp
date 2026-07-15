#pragma once

#include <cstddef>
#include <cstdint>
#include <filesystem>
#include <span>
#include <string>
#include <variant>
#include <vector>

#include "pruftnet/capture/pcapng_spool.hpp"

namespace pruftnet::capture::internal {

[[nodiscard]] std::string capture_id_hex(sniffing::CaptureId id);
[[nodiscard]] std::vector<std::byte>
encode_section_header(sniffing::CaptureId capture_id);
[[nodiscard]] std::vector<std::byte>
encode_interface_description(const SpoolInterface &interface);
[[nodiscard]] std::vector<std::byte> encode_enhanced_packet(
    const sniffing::PacketMetadata &metadata, std::uint32_t interface_index,
    std::uint8_t timestamp_resolution, std::span<const std::byte> bytes);

[[nodiscard]] std::variant<PcapngSpool::RecoveryResult, SpoolError>
recover_segment(const std::filesystem::path &path, bool truncate_partial_tail);

} // namespace pruftnet::capture::internal

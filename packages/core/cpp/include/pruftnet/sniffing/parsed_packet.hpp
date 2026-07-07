#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <string>

namespace pruftnet::sniffing {

enum class ParseStatus {
    NotParsed,
    Parsed,
    Unsupported,
    Error,
};

enum class ProtocolId : std::uint32_t {
    Unknown = 0,
    Ethernet = 1,
    Ipv4 = 2,
    Arp = 3,
    Tcp = 4,
    Udp = 5,
};

struct ParsedLayer {
    ProtocolId protocol_id = ProtocolId::Unknown;
    std::uint32_t offset = 0;
    std::uint32_t header_len = 0;
    std::uint32_t payload_offset = 0;
    std::uint32_t payload_len = 0;
};

inline constexpr std::size_t kMaxParsedLayers = 8;

struct ParsedPacket {
    ParseStatus status = ParseStatus::NotParsed;
    ProtocolId top_protocol = ProtocolId::Unknown;
    std::array<ParsedLayer, kMaxParsedLayers> layers{};
    std::size_t layer_count = 0;
    std::uint32_t flags = 0;
    std::string error_message;
};

} // namespace pruftnet::sniffing

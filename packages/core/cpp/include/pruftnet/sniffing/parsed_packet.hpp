#pragma once

#include <cstdint>
#include <string>

namespace pruftnet::sniffing {

enum class ParseStatus {
    NotParsed,
    Parsed,
    Unsupported,
    Error,
};

struct ParsedPacket {
    ParseStatus status = ParseStatus::NotParsed;
    std::uint32_t top_protocol_id = 0;
    std::uint32_t flags = 0;
    std::string error_message;
};

} // namespace pruftnet::sniffing

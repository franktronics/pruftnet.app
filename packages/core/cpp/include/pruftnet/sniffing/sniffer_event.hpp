#pragma once

#include <cstdint>
#include <functional>
#include <string>

#include "pruftnet/sniffing/sniffer_error.hpp"

namespace pruftnet::sniffing {

enum class SnifferEventType {
    Message,
    Error,
};

struct SnifferEvent {
    SnifferEventType type = SnifferEventType::Message;
    SnifferSeverity severity = SnifferSeverity::Info;
    SnifferErrorCode code = SnifferErrorCode::None;
    std::string message;
    std::uint32_t interface_id = 0;
    std::string interface_name;
    int pcap_status = 0;
    std::string pcap_error;
    std::uint64_t sequence = 0;
    std::uint64_t timestamp_ns = 0;
    bool recoverable = false;

    static SnifferEvent from_error(const SnifferError& error);
};

using EventCallback = std::function<void(const SnifferEvent& event)>;

} // namespace pruftnet::sniffing

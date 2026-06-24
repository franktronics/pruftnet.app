#pragma once

#include <cstdint>
#include <functional>
#include <string>

#include "pruftnet/capture/capture_error.hpp"

namespace pruftnet::capture {

enum class CaptureEventType {
    Message,
    Error,
    Stats,
};

struct CaptureEvent {
    CaptureEventType type = CaptureEventType::Message;
    CaptureSeverity severity = CaptureSeverity::Info;
    CaptureErrorCode code = CaptureErrorCode::None;
    std::string message;
    std::string interface_name;
    int pcap_status = 0;
    std::string pcap_error;
    std::uint64_t sequence = 0;
    std::uint64_t timestamp_ns = 0;
    bool recoverable = false;

    static CaptureEvent from_error(const CaptureError& error);
};

using CaptureEventCallback = std::function<void(const CaptureEvent& event)>;

} // namespace pruftnet::capture

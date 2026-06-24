#include "pruftnet/capture/capture_error.hpp"

#include <chrono>
#include <utility>

#include "pruftnet/capture/capture_event.hpp"

namespace pruftnet::capture {

std::string to_string(CaptureSeverity severity) {
    switch (severity) {
    case CaptureSeverity::Info:
        return "info";
    case CaptureSeverity::Warning:
        return "warning";
    case CaptureSeverity::Error:
        return "error";
    case CaptureSeverity::Fatal:
        return "fatal";
    }

    return "unknown";
}

std::string to_string(CaptureErrorCode code) {
    switch (code) {
    case CaptureErrorCode::None:
        return "None";
    case CaptureErrorCode::InvalidConfig:
        return "InvalidConfig";
    case CaptureErrorCode::PcapCreateFailed:
        return "PcapCreateFailed";
    case CaptureErrorCode::PcapConfigureFailed:
        return "PcapConfigureFailed";
    case CaptureErrorCode::PcapActivateFailed:
        return "PcapActivateFailed";
    case CaptureErrorCode::PermissionDenied:
        return "PermissionDenied";
    case CaptureErrorCode::DeviceNotFound:
        return "DeviceNotFound";
    case CaptureErrorCode::UnsupportedLinkType:
        return "UnsupportedLinkType";
    case CaptureErrorCode::FilterCompileFailed:
        return "FilterCompileFailed";
    case CaptureErrorCode::FilterApplyFailed:
        return "FilterApplyFailed";
    case CaptureErrorCode::RingFull:
        return "RingFull";
    case CaptureErrorCode::DispatchFailed:
        return "DispatchFailed";
    case CaptureErrorCode::AllocationFailed:
        return "AllocationFailed";
    case CaptureErrorCode::ThreadStartFailed:
        return "ThreadStartFailed";
    case CaptureErrorCode::StatsReadFailed:
        return "StatsReadFailed";
    case CaptureErrorCode::InternalInvariantViolation:
        return "InternalInvariantViolation";
    }

    return "Unknown";
}

CaptureError make_capture_error(
    CaptureErrorCode code,
    CaptureSeverity severity,
    std::string message,
    std::string interface_name,
    int pcap_status,
    std::string pcap_error,
    bool recoverable) {
    CaptureError error;
    error.code = code;
    error.severity = severity;
    error.message = std::move(message);
    error.interface_name = std::move(interface_name);
    error.pcap_status = pcap_status;
    error.pcap_error = std::move(pcap_error);
    error.timestamp_ns = monotonic_time_ns();
    error.recoverable = recoverable;
    return error;
}

std::uint64_t monotonic_time_ns() noexcept {
    const auto now = std::chrono::steady_clock::now().time_since_epoch();
    return static_cast<std::uint64_t>(
        std::chrono::duration_cast<std::chrono::nanoseconds>(now).count());
}

CaptureEvent CaptureEvent::from_error(const CaptureError& error) {
    CaptureEvent event;
    event.type = CaptureEventType::Error;
    event.severity = error.severity;
    event.code = error.code;
    event.message = error.message;
    event.interface_name = error.interface_name;
    event.pcap_status = error.pcap_status;
    event.pcap_error = error.pcap_error;
    event.sequence = error.sequence;
    event.timestamp_ns = error.timestamp_ns;
    event.recoverable = error.recoverable;
    return event;
}

} // namespace pruftnet::capture

#include "pruftnet/sniffing/sniffer_error.hpp"

#include <chrono>
#include <utility>

#include "pruftnet/sniffing/sniffer_event.hpp"

namespace pruftnet::sniffing {

std::string to_string(SnifferSeverity severity) {
    switch (severity) {
    case SnifferSeverity::Info:
        return "info";
    case SnifferSeverity::Warning:
        return "warning";
    case SnifferSeverity::Error:
        return "error";
    case SnifferSeverity::Fatal:
        return "fatal";
    }

    return "unknown";
}

std::string to_string(SnifferErrorCode code) {
    switch (code) {
    case SnifferErrorCode::None:
        return "None";
    case SnifferErrorCode::InvalidOptions:
        return "InvalidOptions";
    case SnifferErrorCode::PcapCreateFailed:
        return "PcapCreateFailed";
    case SnifferErrorCode::PcapOpenFailed:
        return "PcapOpenFailed";
    case SnifferErrorCode::PcapConfigureFailed:
        return "PcapConfigureFailed";
    case SnifferErrorCode::PcapActivateFailed:
        return "PcapActivateFailed";
    case SnifferErrorCode::PermissionDenied:
        return "PermissionDenied";
    case SnifferErrorCode::DeviceNotFound:
        return "DeviceNotFound";
    case SnifferErrorCode::UnsupportedLinkType:
        return "UnsupportedLinkType";
    case SnifferErrorCode::FilterCompileFailed:
        return "FilterCompileFailed";
    case SnifferErrorCode::FilterApplyFailed:
        return "FilterApplyFailed";
    case SnifferErrorCode::RingFull:
        return "RingFull";
    case SnifferErrorCode::DispatchFailed:
        return "DispatchFailed";
    case SnifferErrorCode::AllocationFailed:
        return "AllocationFailed";
    case SnifferErrorCode::MemoryBudgetExceeded:
        return "MemoryBudgetExceeded";
    case SnifferErrorCode::CaptureIdentityUnavailable:
        return "CaptureIdentityUnavailable";
    case SnifferErrorCode::ThreadStartFailed:
        return "ThreadStartFailed";
    case SnifferErrorCode::StatsReadFailed:
        return "StatsReadFailed";
    case SnifferErrorCode::InternalInvariantViolation:
        return "InternalInvariantViolation";
    }

    return "Unknown";
}

std::uint64_t monotonic_time_ns() noexcept {
    const auto now = std::chrono::steady_clock::now().time_since_epoch();
    return static_cast<std::uint64_t>(
        std::chrono::duration_cast<std::chrono::nanoseconds>(now).count());
}

SnifferError make_sniffer_error(
    SnifferErrorCode code,
    SnifferSeverity severity,
    std::string message,
    std::string interface_name,
    int pcap_status,
    std::string pcap_error,
    bool recoverable,
    std::uint32_t interface_id) {
    SnifferError error;
    error.code = code;
    error.severity = severity;
    error.message = std::move(message);
    error.interface_id = interface_id;
    error.interface_name = std::move(interface_name);
    error.pcap_status = pcap_status;
    error.pcap_error = std::move(pcap_error);
    error.timestamp_ns = monotonic_time_ns();
    error.recoverable = recoverable;
    return error;
}

SnifferEvent SnifferEvent::from_error(const SnifferError& error) {
    SnifferEvent event;
    event.type = SnifferEventType::Error;
    event.severity = error.severity;
    event.code = error.code;
    event.message = error.message;
    event.interface_id = error.interface_id;
    event.interface_name = error.interface_name;
    event.pcap_status = error.pcap_status;
    event.pcap_error = error.pcap_error;
    event.sequence = error.sequence;
    event.timestamp_ns = error.timestamp_ns;
    event.recoverable = error.recoverable;
    return event;
}

} // namespace pruftnet::sniffing

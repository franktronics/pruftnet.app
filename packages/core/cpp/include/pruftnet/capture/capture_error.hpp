#pragma once

#include <cstdint>
#include <string>

namespace pruftnet::capture {

enum class CaptureSeverity {
    Info,
    Warning,
    Error,
    Fatal,
};

enum class CaptureErrorCode {
    None,
    InvalidConfig,
    PcapCreateFailed,
    PcapConfigureFailed,
    PcapActivateFailed,
    PermissionDenied,
    DeviceNotFound,
    UnsupportedLinkType,
    FilterCompileFailed,
    FilterApplyFailed,
    RingFull,
    DispatchFailed,
    AllocationFailed,
    ThreadStartFailed,
    StatsReadFailed,
    InternalInvariantViolation,
};

struct CaptureError {
    CaptureErrorCode code = CaptureErrorCode::None;
    CaptureSeverity severity = CaptureSeverity::Error;
    std::string message;
    std::string interface_name;
    int pcap_status = 0;
    std::string pcap_error;
    int errno_value = 0;
    std::uint64_t sequence = 0;
    std::uint64_t timestamp_ns = 0;
    bool recoverable = false;
};

std::string to_string(CaptureSeverity severity);
std::string to_string(CaptureErrorCode code);

CaptureError make_capture_error(
    CaptureErrorCode code,
    CaptureSeverity severity,
    std::string message,
    std::string interface_name = {},
    int pcap_status = 0,
    std::string pcap_error = {},
    bool recoverable = false);

std::uint64_t monotonic_time_ns() noexcept;

} // namespace pruftnet::capture

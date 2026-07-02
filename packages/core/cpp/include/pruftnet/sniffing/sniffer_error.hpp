#pragma once

#include <cstdint>
#include <string>

namespace pruftnet::sniffing {

enum class SnifferSeverity {
    Info,
    Warning,
    Error,
    Fatal,
};

enum class SnifferErrorCode {
    None,
    InvalidOptions,
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

struct SnifferError {
    SnifferErrorCode code = SnifferErrorCode::None;
    SnifferSeverity severity = SnifferSeverity::Error;
    std::string message;
    std::string interface_name;
    int pcap_status = 0;
    std::string pcap_error;
    std::uint64_t sequence = 0;
    std::uint64_t timestamp_ns = 0;
    bool recoverable = false;
};

std::string to_string(SnifferSeverity severity);
std::string to_string(SnifferErrorCode code);
std::uint64_t monotonic_time_ns() noexcept;

SnifferError make_sniffer_error(
    SnifferErrorCode code,
    SnifferSeverity severity,
    std::string message,
    std::string interface_name = {},
    int pcap_status = 0,
    std::string pcap_error = {},
    bool recoverable = false);

} // namespace pruftnet::sniffing

#include "pruftnet/capture/pcap_handle.hpp"

#include <cstring>
#include <memory>
#include <pcap/pcap.h>
#include <utility>

namespace pruftnet::capture {
namespace {

CaptureError pcap_configuration_error(
    const CaptureConfig& config,
    CaptureErrorCode code,
    std::string operation,
    int status,
    pcap_t* handle = nullptr) {
    std::string pcap_error = pcap_status_to_string(status);
    if (handle != nullptr) {
        if (const auto* last_error = pcap_geterr(handle); last_error != nullptr && last_error[0] != '\0') {
            pcap_error = last_error;
        }
    }

    return make_capture_error(
        code,
        CaptureSeverity::Error,
        std::move(operation) + " failed: " + pcap_error,
        config.interface_name,
        status,
        pcap_error);
}

CaptureErrorCode activation_error_code(int status) {
#ifdef PCAP_ERROR_PERM_DENIED
    if (status == PCAP_ERROR_PERM_DENIED) {
        return CaptureErrorCode::PermissionDenied;
    }
#endif
#ifdef PCAP_ERROR_NO_SUCH_DEVICE
    if (status == PCAP_ERROR_NO_SUCH_DEVICE) {
        return CaptureErrorCode::DeviceNotFound;
    }
#endif

    return CaptureErrorCode::PcapActivateFailed;
}

pcap_direction_t direction_to_pcap(CaptureDirection direction) {
    switch (direction) {
    case CaptureDirection::InOut:
        return PCAP_D_INOUT;
    case CaptureDirection::InOnly:
        return PCAP_D_IN;
    case CaptureDirection::OutOnly:
        return PCAP_D_OUT;
    }

    return PCAP_D_INOUT;
}

} // namespace

PcapHandle::PcapHandle(pcap_t* handle, TimestampPrecision timestamp_precision, int link_type)
    : handle_(handle), timestamp_precision_(timestamp_precision), link_type_(link_type) {}

PcapHandle::~PcapHandle() {
    if (handle_ != nullptr) {
        pcap_close(handle_);
    }
}

PcapHandle::PcapHandle(PcapHandle&& other) noexcept
    : handle_(other.handle_),
      timestamp_precision_(other.timestamp_precision_),
      link_type_(other.link_type_) {
    other.handle_ = nullptr;
}

PcapHandle& PcapHandle::operator=(PcapHandle&& other) noexcept {
    if (this == &other) {
        return *this;
    }

    if (handle_ != nullptr) {
        pcap_close(handle_);
    }

    handle_ = other.handle_;
    timestamp_precision_ = other.timestamp_precision_;
    link_type_ = other.link_type_;
    other.handle_ = nullptr;
    return *this;
}

pcap_t* PcapHandle::get() const noexcept {
    return handle_;
}

bool PcapHandle::valid() const noexcept {
    return handle_ != nullptr;
}

int PcapHandle::link_type() const noexcept {
    return link_type_;
}

TimestampPrecision PcapHandle::timestamp_precision() const noexcept {
    return timestamp_precision_;
}

std::string PcapHandle::last_error() const {
    if (handle_ == nullptr) {
        return "pcap handle is not open";
    }

    if (const auto* error = pcap_geterr(handle_); error != nullptr) {
        return error;
    }

    return {};
}

int PcapHandle::dispatch(int packet_count, pcap_handler callback, unsigned char* user_data) noexcept {
    if (handle_ == nullptr) {
        return PCAP_ERROR;
    }

    return pcap_dispatch(handle_, packet_count, callback, user_data);
}

void PcapHandle::break_loop() noexcept {
    if (handle_ != nullptr) {
        pcap_breakloop(handle_);
    }
}

std::variant<PcapKernelStats, CaptureError> PcapHandle::read_stats(
    const std::string& interface_name) const {
    if (handle_ == nullptr) {
        return make_capture_error(
            CaptureErrorCode::StatsReadFailed,
            CaptureSeverity::Warning,
            "Cannot read pcap stats because the handle is closed.",
            interface_name,
            0,
            {},
            true);
    }

    pcap_stat stats = {};
    if (pcap_stats(handle_, &stats) != 0) {
        return make_capture_error(
            CaptureErrorCode::StatsReadFailed,
            CaptureSeverity::Warning,
            "Failed to read pcap stats.",
            interface_name,
            0,
            pcap_geterr(handle_),
            true);
    }

    PcapKernelStats snapshot;
    snapshot.recv = static_cast<std::uint64_t>(stats.ps_recv);
    snapshot.drop = static_cast<std::uint64_t>(stats.ps_drop);
    snapshot.ifdrop = static_cast<std::uint64_t>(stats.ps_ifdrop);
    return snapshot;
}

PcapOpenResult open_pcap_handle(const CaptureConfig& config) {
    char errbuf[PCAP_ERRBUF_SIZE] = {};
    pcap_t* raw_handle = pcap_create(config.interface_name.c_str(), errbuf);

    if (raw_handle == nullptr) {
        return make_capture_error(
            CaptureErrorCode::PcapCreateFailed,
            CaptureSeverity::Error,
            "Failed to create pcap handle.",
            config.interface_name,
            0,
            errbuf);
    }

    std::unique_ptr<pcap_t, decltype(&pcap_close)> handle(raw_handle, pcap_close);
    std::vector<CaptureEvent> warnings;

    if (errbuf[0] != '\0') {
        warnings.push_back(CaptureEvent::from_error(make_capture_error(
            CaptureErrorCode::PcapCreateFailed,
            CaptureSeverity::Warning,
            "pcap_create returned a warning.",
            config.interface_name,
            0,
            errbuf,
            true)));
    }

    auto apply = [&](int status, CaptureErrorCode code, const char* operation) -> std::optional<CaptureError> {
        if (status == 0) {
            return std::nullopt;
        }

        return pcap_configuration_error(config, code, operation, status, handle.get());
    };

    if (auto error = apply(pcap_set_snaplen(handle.get(), config.snaplen), CaptureErrorCode::PcapConfigureFailed, "pcap_set_snaplen")) {
        return *error;
    }

    if (auto error = apply(pcap_set_promisc(handle.get(), config.promiscuous ? 1 : 0), CaptureErrorCode::PcapConfigureFailed, "pcap_set_promisc")) {
        return *error;
    }

    if (auto error = apply(pcap_set_buffer_size(handle.get(), config.pcap_buffer_size_bytes), CaptureErrorCode::PcapConfigureFailed, "pcap_set_buffer_size")) {
        return *error;
    }

    if (auto error = apply(pcap_set_timeout(handle.get(), config.read_timeout_ms), CaptureErrorCode::PcapConfigureFailed, "pcap_set_timeout")) {
        return *error;
    }

    if (config.monitor_mode) {
#if defined(PRUFTNET_HAVE_PCAP_SET_RFMON)
        if (auto error = apply(pcap_set_rfmon(handle.get(), 1), CaptureErrorCode::PcapConfigureFailed, "pcap_set_rfmon")) {
            return *error;
        }
#else
        return make_capture_error(
            CaptureErrorCode::PcapConfigureFailed,
            CaptureSeverity::Error,
            "Monitor mode was requested, but this libpcap build does not expose pcap_set_rfmon.",
            config.interface_name);
#endif
    }

    if (config.immediate_mode) {
#if defined(PRUFTNET_HAVE_PCAP_SET_IMMEDIATE_MODE)
        if (auto error = apply(pcap_set_immediate_mode(handle.get(), 1), CaptureErrorCode::PcapConfigureFailed, "pcap_set_immediate_mode")) {
            return *error;
        }
#else
        warnings.push_back(CaptureEvent::from_error(make_capture_error(
            CaptureErrorCode::PcapConfigureFailed,
            CaptureSeverity::Warning,
            "Immediate mode was requested, but this libpcap build does not expose pcap_set_immediate_mode.",
            config.interface_name,
            0,
            {},
            true)));
#endif
    }

    TimestampPrecision timestamp_precision = TimestampPrecision::Microseconds;
    if (config.prefer_nanosecond_timestamps) {
#if defined(PRUFTNET_HAVE_PCAP_SET_TSTAMP_PRECISION)
        const auto nano_status = pcap_set_tstamp_precision(handle.get(), PCAP_TSTAMP_PRECISION_NANO);
        if (nano_status == 0) {
            timestamp_precision = TimestampPrecision::Nanoseconds;
        } else {
            warnings.push_back(CaptureEvent::from_error(make_capture_error(
                CaptureErrorCode::PcapConfigureFailed,
                CaptureSeverity::Warning,
                "Nanosecond timestamps are not supported; falling back to microsecond timestamps.",
                config.interface_name,
                nano_status,
                pcap_status_to_string(nano_status),
                true)));

            if (auto error = apply(pcap_set_tstamp_precision(handle.get(), PCAP_TSTAMP_PRECISION_MICRO), CaptureErrorCode::PcapConfigureFailed, "pcap_set_tstamp_precision")) {
                return *error;
            }
        }
#else
        warnings.push_back(CaptureEvent::from_error(make_capture_error(
            CaptureErrorCode::PcapConfigureFailed,
            CaptureSeverity::Warning,
            "Nanosecond timestamps were requested, but this libpcap build does not expose pcap_set_tstamp_precision.",
            config.interface_name,
            0,
            {},
            true)));
#endif
    }

    const auto activate_status = pcap_activate(handle.get());
    if (activate_status < 0) {
        return pcap_configuration_error(
            config,
            activation_error_code(activate_status),
            "pcap_activate",
            activate_status,
            handle.get());
    }

    if (activate_status > 0) {
        warnings.push_back(CaptureEvent::from_error(make_capture_error(
            CaptureErrorCode::PcapActivateFailed,
            CaptureSeverity::Warning,
            "pcap_activate returned a warning.",
            config.interface_name,
            activate_status,
            pcap_status_to_string(activate_status),
            true)));
    }

    if (config.direction != CaptureDirection::InOut) {
#if defined(PRUFTNET_HAVE_PCAP_SETDIRECTION)
        if (pcap_setdirection(handle.get(), direction_to_pcap(config.direction)) != 0) {
            return make_capture_error(
                CaptureErrorCode::PcapConfigureFailed,
                CaptureSeverity::Error,
                "Failed to set capture direction.",
                config.interface_name,
                0,
                pcap_geterr(handle.get()));
        }
#else
        return make_capture_error(
            CaptureErrorCode::PcapConfigureFailed,
            CaptureSeverity::Error,
            "A non-default capture direction was requested, but this libpcap build does not expose pcap_setdirection.",
            config.interface_name);
#endif
    }

    if (!config.bpf_filter.empty()) {
        bpf_program program = {};
        if (pcap_compile(handle.get(), &program, config.bpf_filter.c_str(), 1, PCAP_NETMASK_UNKNOWN) != 0) {
            return make_capture_error(
                CaptureErrorCode::FilterCompileFailed,
                CaptureSeverity::Error,
                "Failed to compile BPF filter.",
                config.interface_name,
                0,
                pcap_geterr(handle.get()));
        }

        if (pcap_setfilter(handle.get(), &program) != 0) {
            const auto error = make_capture_error(
                CaptureErrorCode::FilterApplyFailed,
                CaptureSeverity::Error,
                "Failed to apply BPF filter.",
                config.interface_name,
                0,
                pcap_geterr(handle.get()));
            pcap_freecode(&program);
            return error;
        }

        pcap_freecode(&program);
    }

    const auto link_type = pcap_datalink(handle.get());

    PcapOpenSuccess success;
    success.handle = PcapHandle(handle.release(), timestamp_precision, link_type);
    success.warnings = std::move(warnings);
    return success;
}

std::string pcap_status_to_string(int status) {
#if defined(PRUFTNET_HAVE_PCAP_STATUSTOSTR)
    if (const auto* value = pcap_statustostr(status); value != nullptr) {
        return value;
    }
#endif

    return "pcap status " + std::to_string(status);
}

} // namespace pruftnet::capture

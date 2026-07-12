#include "sniffing/live_pcap_packet_source.hpp"

#include <memory>
#include <optional>
#include <utility>

namespace pruftnet::sniffing::internal {
namespace {

SnifferError pcap_configuration_error(
    const std::string& source_name,
    std::uint32_t interface_id,
    SnifferErrorCode code,
    std::string operation,
    int status,
    pcap_t* handle = nullptr) {
    std::string pcap_error = pcap_status_to_string(status);
    if (handle != nullptr) {
        if (const auto* last_error = pcap_geterr(handle); last_error != nullptr && last_error[0] != '\0') {
            pcap_error = last_error;
        }
    }

    return make_sniffer_error(
        code,
        SnifferSeverity::Error,
        std::move(operation) + " failed: " + pcap_error,
        source_name,
        status,
        pcap_error,
        false,
        interface_id);
}

SnifferErrorCode activation_error_code(int status) {
#ifdef PCAP_ERROR_PERM_DENIED
    if (status == PCAP_ERROR_PERM_DENIED) {
        return SnifferErrorCode::PermissionDenied;
    }
#endif
#ifdef PCAP_ERROR_NO_SUCH_DEVICE
    if (status == PCAP_ERROR_NO_SUCH_DEVICE) {
        return SnifferErrorCode::DeviceNotFound;
    }
#endif
    return SnifferErrorCode::PcapActivateFailed;
}

int resolved_snapshot_length(pcap_t* handle, int fallback) noexcept {
    const auto snapshot = pcap_snapshot(handle);
    return snapshot > 0 ? snapshot : fallback;
}

} // namespace

LivePcapPacketSource::LivePcapPacketSource(SnifferInterfaceOptions options) : options_(std::move(options)) {}

PacketSourceOpenResult LivePcapPacketSource::open() {
    close();

    char errbuf[PCAP_ERRBUF_SIZE] = {};
    pcap_t* raw_handle = pcap_create(options_.name.c_str(), errbuf);

    if (raw_handle == nullptr) {
        return make_sniffer_error(
            SnifferErrorCode::PcapCreateFailed,
            SnifferSeverity::Error,
            "Failed to create pcap session.",
            options_.name,
            0,
            errbuf,
            false,
            options_.id);
    }

    std::unique_ptr<pcap_t, decltype(&pcap_close)> handle(raw_handle, pcap_close);
    std::vector<SnifferEvent> warnings;

    if (errbuf[0] != '\0') {
        warnings.push_back(SnifferEvent::from_error(make_sniffer_error(
            SnifferErrorCode::PcapCreateFailed,
            SnifferSeverity::Warning,
            "pcap_create returned a warning.",
            options_.name,
            0,
            errbuf,
            true,
            options_.id)));
    }

    auto apply = [&](int status, SnifferErrorCode code, const char* operation) -> std::optional<SnifferError> {
        if (status == 0) {
            return std::nullopt;
        }

        return pcap_configuration_error(options_.name, options_.id, code, operation, status, handle.get());
    };

    if (auto error = apply(
            pcap_set_snaplen(handle.get(), options_.snaplen),
            SnifferErrorCode::PcapConfigureFailed,
            "pcap_set_snaplen")) {
        return *error;
    }

    if (auto error = apply(
            pcap_set_promisc(handle.get(), options_.promiscuous ? 1 : 0),
            SnifferErrorCode::PcapConfigureFailed,
            "pcap_set_promisc")) {
        return *error;
    }

    if (auto error = apply(
            pcap_set_buffer_size(handle.get(), options_.pcap_buffer_size_bytes),
            SnifferErrorCode::PcapConfigureFailed,
            "pcap_set_buffer_size")) {
        return *error;
    }

    if (auto error = apply(
            pcap_set_timeout(handle.get(), options_.read_timeout_ms),
            SnifferErrorCode::PcapConfigureFailed,
            "pcap_set_timeout")) {
        return *error;
    }

    TimestampPrecision timestamp_precision = TimestampPrecision::Microseconds;
#if defined(PRUFTNET_HAVE_PCAP_SET_TSTAMP_PRECISION)
    const auto nano_status = pcap_set_tstamp_precision(handle.get(), PCAP_TSTAMP_PRECISION_NANO);
    if (nano_status == 0) {
        timestamp_precision = TimestampPrecision::Nanoseconds;
    } else {
        warnings.push_back(SnifferEvent::from_error(make_sniffer_error(
            SnifferErrorCode::PcapConfigureFailed,
            SnifferSeverity::Info,
            "Nanosecond timestamps are not supported; falling back to microsecond timestamps.",
            options_.name,
            nano_status,
            pcap_status_to_string(nano_status),
            true,
            options_.id)));
    }
#endif

    if (options_.timestamp_type.has_value()) {
#if defined(PRUFTNET_HAVE_PCAP_TSTAMP_TYPE_NAME_TO_VAL) && defined(PRUFTNET_HAVE_PCAP_SET_TSTAMP_TYPE)
        const auto timestamp_type = pcap_tstamp_type_name_to_val(options_.timestamp_type->c_str());
        if (timestamp_type < 0) {
            return make_sniffer_error(
                SnifferErrorCode::PcapConfigureFailed,
                SnifferSeverity::Error,
                "Unknown pcap timestamp type.",
                options_.name,
                timestamp_type,
                *options_.timestamp_type,
                false,
                options_.id);
        }

        if (auto error = apply(
                pcap_set_tstamp_type(handle.get(), timestamp_type),
                SnifferErrorCode::PcapConfigureFailed,
                "pcap_set_tstamp_type")) {
            return *error;
        }
#else
        return make_sniffer_error(
            SnifferErrorCode::PcapConfigureFailed,
            SnifferSeverity::Error,
            "This libpcap build does not support selecting timestamp types.",
            options_.name,
            0,
            *options_.timestamp_type,
            false,
            options_.id);
#endif
    }

    if (options_.monitor_mode) {
#if defined(PRUFTNET_HAVE_PCAP_SET_RFMON)
        if (auto error = apply(
                pcap_set_rfmon(handle.get(), 1),
                SnifferErrorCode::PcapConfigureFailed,
                "pcap_set_rfmon")) {
            return *error;
        }
#else
        return make_sniffer_error(
            SnifferErrorCode::PcapConfigureFailed,
            SnifferSeverity::Error,
            "This libpcap build does not support monitor mode.",
            options_.name,
            0,
            {},
            false,
            options_.id);
#endif
    }

    const auto activate_status = pcap_activate(handle.get());
    if (activate_status < 0) {
        return pcap_configuration_error(
            options_.name,
            options_.id,
            activation_error_code(activate_status),
            "pcap_activate",
            activate_status,
            handle.get());
    }

    if (activate_status > 0) {
        warnings.push_back(SnifferEvent::from_error(make_sniffer_error(
            SnifferErrorCode::PcapActivateFailed,
            SnifferSeverity::Warning,
            "pcap_activate returned a warning.",
            options_.name,
            activate_status,
            pcap_status_to_string(activate_status),
            true,
            options_.id)));
    }

    if (options_.requested_link_type.has_value()) {
#if defined(PRUFTNET_HAVE_PCAP_SET_DATALINK)
        if (pcap_set_datalink(handle.get(), *options_.requested_link_type) != 0) {
            return make_sniffer_error(
                SnifferErrorCode::PcapConfigureFailed,
                SnifferSeverity::Error,
                "Failed to set pcap link type.",
                options_.name,
                0,
                pcap_geterr(handle.get()),
                false,
                options_.id);
        }
#else
        return make_sniffer_error(
            SnifferErrorCode::PcapConfigureFailed,
            SnifferSeverity::Error,
            "This libpcap build does not support selecting link types.",
            options_.name,
            0,
            {},
            false,
            options_.id);
#endif
    }

    if (!options_.bpf_filter.empty()) {
        bpf_u_int32 network = 0;
        bpf_u_int32 netmask = PCAP_NETMASK_UNKNOWN;
        char lookup_error[PCAP_ERRBUF_SIZE] = {};
        if (pcap_lookupnet(options_.name.c_str(), &network, &netmask, lookup_error) != 0) {
            netmask = PCAP_NETMASK_UNKNOWN;
            warnings.push_back(SnifferEvent::from_error(make_sniffer_error(
                SnifferErrorCode::PcapConfigureFailed,
                SnifferSeverity::Warning,
                "Failed to determine the interface netmask; compiling the BPF filter with an unknown netmask.",
                options_.name,
                0,
                lookup_error,
                true,
                options_.id)));
        }
        bpf_program program = {};
        if (pcap_compile(
                handle.get(),
                &program,
                options_.bpf_filter.c_str(),
                options_.bpf_optimize ? 1 : 0,
                netmask) != 0) {
            return make_sniffer_error(
                SnifferErrorCode::FilterCompileFailed,
                SnifferSeverity::Error,
                "Failed to compile BPF filter.",
                options_.name,
                0,
                pcap_geterr(handle.get()),
                false,
                options_.id);
        }

        if (pcap_setfilter(handle.get(), &program) != 0) {
            const auto error = make_sniffer_error(
                SnifferErrorCode::FilterApplyFailed,
                SnifferSeverity::Error,
                "Failed to apply BPF filter.",
                options_.name,
                0,
                pcap_geterr(handle.get()),
                false,
                options_.id);
            pcap_freecode(&program);
            return error;
        }

        pcap_freecode(&program);
    }

    const auto link_type = pcap_datalink(handle.get());
    const auto snapshot_length = resolved_snapshot_length(handle.get(), options_.snaplen);

    handle_.reset(handle.release(), timestamp_precision, link_type, snapshot_length);

    PacketSourceOpenSuccess success;
    success.warnings = std::move(warnings);
    return success;
}

void LivePcapPacketSource::close() noexcept { handle_.reset(); }

void LivePcapPacketSource::interrupt() noexcept { handle_.break_loop(); }

PacketSourceDispatchResult LivePcapPacketSource::dispatch(
    int max_packets,
    PacketSourceCallback callback,
    void* user_data) noexcept {
    PacketSourceDispatchContext context{callback, user_data};
    const auto result = handle_.dispatch(
        max_packets,
        &packet_source_pcap_trampoline,
        reinterpret_cast<unsigned char*>(&context));

    if (result > 0) {
        return {PacketSourceDispatchStatus::PacketsRead, result, result, {}};
    }

    if (result == 0) {
        return {PacketSourceDispatchStatus::NoPacketsAvailable, 0, result, {}};
    }

    if (result == PCAP_ERROR_BREAK) {
        return {PacketSourceDispatchStatus::Interrupted, 0, result, {}};
    }

    return {PacketSourceDispatchStatus::Error, 0, result, handle_.last_error()};
}

int LivePcapPacketSource::link_type() const noexcept { return handle_.link_type(); }

int LivePcapPacketSource::snapshot_length() const noexcept { return handle_.snapshot_length(); }

TimestampPrecision LivePcapPacketSource::timestamp_precision() const noexcept {
    return handle_.timestamp_precision();
}

std::variant<PcapKernelStats, SnifferError> LivePcapPacketSource::read_stats() const {
    return handle_.read_stats(options_.name);
}

std::string LivePcapPacketSource::source_name() const { return options_.name; }

} // namespace pruftnet::sniffing::internal

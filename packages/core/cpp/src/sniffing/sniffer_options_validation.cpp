#include "sniffing/sniffer_options_validation.hpp"

namespace pruftnet::sniffing::internal {

std::optional<SnifferError> validate_sniffer_options(
    const SnifferOptions& options,
    SnifferOptionsValidation validation) {
    if (validation.require_interface_name && options.interface_name.empty()) {
        return make_sniffer_error(
            SnifferErrorCode::InvalidOptions,
            SnifferSeverity::Error,
            "SnifferOptions.interface_name is required.");
    }

    if (options.snaplen <= 0) {
        return make_sniffer_error(
            SnifferErrorCode::InvalidOptions,
            SnifferSeverity::Error,
            "SnifferOptions.snaplen must be greater than zero.",
            options.interface_name);
    }

    if (options.pcap_buffer_size_bytes <= 0) {
        return make_sniffer_error(
            SnifferErrorCode::InvalidOptions,
            SnifferSeverity::Error,
            "SnifferOptions.pcap_buffer_size_bytes must be greater than zero.",
            options.interface_name);
    }

    if (options.read_timeout_ms < 0) {
        return make_sniffer_error(
            SnifferErrorCode::InvalidOptions,
            SnifferSeverity::Error,
            "SnifferOptions.read_timeout_ms must be zero or greater.",
            options.interface_name);
    }

    if (options.pcap_dispatch_batch_size <= 0) {
        return make_sniffer_error(
            SnifferErrorCode::InvalidOptions,
            SnifferSeverity::Error,
            "SnifferOptions.pcap_dispatch_batch_size must be greater than zero.",
            options.interface_name);
    }

    if (options.ring_slots == 0) {
        return make_sniffer_error(
            SnifferErrorCode::InvalidOptions,
            SnifferSeverity::Error,
            "SnifferOptions.ring_slots must be greater than zero.",
            options.interface_name);
    }

    if (options.accepted_link_types.empty()) {
        return make_sniffer_error(
            SnifferErrorCode::InvalidOptions,
            SnifferSeverity::Error,
            "SnifferOptions.accepted_link_types must not be empty.",
            options.interface_name);
    }

    return std::nullopt;
}

} // namespace pruftnet::sniffing::internal

#include "sniffing/sniffer_options_validation.hpp"

#include <unordered_set>

namespace pruftnet::sniffing::internal {

std::optional<SnifferError> validate_sniffer_options(
    const SnifferOptions& options,
    SnifferOptionsValidation validation) {
    if (options.interfaces.empty()) {
        return make_sniffer_error(
            SnifferErrorCode::InvalidOptions,
            SnifferSeverity::Error,
            "SnifferOptions.interfaces must contain at least one interface.");
    }

    std::unordered_set<std::uint32_t> resolved_ids;
    for (std::size_t index = 0; index < options.interfaces.size(); ++index) {
        const auto& interface = options.interfaces[index];
        const auto interface_id = interface.id == kAutoInterfaceId
            ? static_cast<std::uint32_t>(index)
            : interface.id;

        if (validation.require_interface_name && interface.name.empty()) {
            return make_sniffer_error(
                SnifferErrorCode::InvalidOptions,
                SnifferSeverity::Error,
                "SnifferInterfaceOptions.name is required.",
                interface.name,
                0,
                {},
                false,
                interface_id);
        }

        if (!resolved_ids.insert(interface_id).second) {
            return make_sniffer_error(
                SnifferErrorCode::InvalidOptions,
                SnifferSeverity::Error,
                "SnifferInterfaceOptions.id values must be unique after auto-assignment.",
                interface.name,
                0,
                {},
                false,
                interface_id);
        }

        if (interface.snaplen <= 0) {
            return make_sniffer_error(
                SnifferErrorCode::InvalidOptions,
                SnifferSeverity::Error,
                "SnifferInterfaceOptions.snaplen must be greater than zero.",
                interface.name,
                0,
                {},
                false,
                interface_id);
        }

        if (interface.pcap_buffer_size_bytes <= 0) {
            return make_sniffer_error(
                SnifferErrorCode::InvalidOptions,
                SnifferSeverity::Error,
                "SnifferInterfaceOptions.pcap_buffer_size_bytes must be greater than zero.",
                interface.name,
                0,
                {},
                false,
                interface_id);
        }

        if (interface.read_timeout_ms < 0) {
            return make_sniffer_error(
                SnifferErrorCode::InvalidOptions,
                SnifferSeverity::Error,
                "SnifferInterfaceOptions.read_timeout_ms must be zero or greater.",
                interface.name,
                0,
                {},
                false,
                interface_id);
        }

        if (interface.pcap_dispatch_batch_size <= 0) {
            return make_sniffer_error(
                SnifferErrorCode::InvalidOptions,
                SnifferSeverity::Error,
                "SnifferInterfaceOptions.pcap_dispatch_batch_size must be greater than zero.",
                interface.name,
                0,
                {},
                false,
                interface_id);
        }

        if (interface.ring_slots == 0) {
            return make_sniffer_error(
                SnifferErrorCode::InvalidOptions,
                SnifferSeverity::Error,
                "SnifferInterfaceOptions.ring_slots must be greater than zero.",
                interface.name,
                0,
                {},
                false,
                interface_id);
        }
    }

    if (options.accepted_link_types.empty()) {
        return make_sniffer_error(
            SnifferErrorCode::InvalidOptions,
            SnifferSeverity::Error,
            "SnifferOptions.accepted_link_types must not be empty.",
            options.interfaces.front().name);
    }

    return std::nullopt;
}

} // namespace pruftnet::sniffing::internal

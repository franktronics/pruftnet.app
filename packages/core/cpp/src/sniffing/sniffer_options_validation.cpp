#include "sniffing/sniffer_options_validation.hpp"

#include <limits>
#include <unordered_set>

#include "sniffing/packet_ring.hpp"

namespace pruftnet::sniffing::internal {
namespace {

bool ring_estimate_fits(std::size_t slots, std::size_t packet_size, std::size_t& total) noexcept {
    if (slots == std::numeric_limits<std::size_t>::max()) {
        return false;
    }
    const auto allocated_slots = slots + 1;
    if (packet_size > std::numeric_limits<std::size_t>::max() / allocated_slots) {
        return false;
    }
    auto bytes = allocated_slots * packet_size;
    constexpr auto metadata_bytes = sizeof(PacketMetadata) + sizeof(std::uint32_t);
    if (metadata_bytes > std::numeric_limits<std::size_t>::max() / allocated_slots) {
        return false;
    }
    const auto metadata_total = allocated_slots * metadata_bytes;
    if (bytes > std::numeric_limits<std::size_t>::max() - metadata_total) {
        return false;
    }
    bytes += metadata_total;
    if (total > std::numeric_limits<std::size_t>::max() - bytes) {
        return false;
    }
    total += bytes;
    return true;
}

} // namespace

std::optional<SnifferError> validate_sniffer_options(
    const SnifferOptions& options,
    SnifferOptionsValidation validation) {
    if (options.interfaces.empty()) {
        return make_sniffer_error(
            SnifferErrorCode::InvalidOptions,
            SnifferSeverity::Error,
            "SnifferOptions.interfaces must contain at least one interface.");
    }
    if (options.interfaces.size() > kMaxCaptureInterfaces) {
        return make_sniffer_error(
            SnifferErrorCode::InvalidOptions,
            SnifferSeverity::Error,
            "SnifferOptions.interfaces exceeds kMaxCaptureInterfaces.");
    }

    std::unordered_set<std::uint32_t> resolved_ids;
    std::unordered_set<std::string> interface_names;
    std::size_t estimated_ring_total = 0;
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

        if (!interface.name.empty() && !interface_names.insert(interface.name).second) {
            return make_sniffer_error(
                SnifferErrorCode::InvalidOptions,
                SnifferSeverity::Error,
                "SnifferInterfaceOptions.name values must be unique.",
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

        if (interface.snaplen <= 0 || interface.snaplen > kMaxSnapshotLength) {
            return make_sniffer_error(
                SnifferErrorCode::InvalidOptions,
                SnifferSeverity::Error,
                "SnifferInterfaceOptions.snaplen must be between 1 and kMaxSnapshotLength.",
                interface.name,
                0,
                {},
                false,
                interface_id);
        }

        if (interface.pcap_buffer_size_bytes <= 0 ||
            interface.pcap_buffer_size_bytes > kMaxPcapBufferSizeBytes) {
            return make_sniffer_error(
                SnifferErrorCode::InvalidOptions,
                SnifferSeverity::Error,
                "SnifferInterfaceOptions.pcap_buffer_size_bytes must be between 1 and kMaxPcapBufferSizeBytes.",
                interface.name,
                0,
                {},
                false,
                interface_id);
        }

        if (interface.read_timeout_ms < 0 || interface.read_timeout_ms > kMaxReadTimeoutMs) {
            return make_sniffer_error(
                SnifferErrorCode::InvalidOptions,
                SnifferSeverity::Error,
                "SnifferInterfaceOptions.read_timeout_ms must be between 0 and kMaxReadTimeoutMs.",
                interface.name,
                0,
                {},
                false,
                interface_id);
        }

        if (interface.pcap_dispatch_batch_size <= 0 ||
            interface.pcap_dispatch_batch_size > kMaxPcapDispatchBatchSize) {
            return make_sniffer_error(
                SnifferErrorCode::InvalidOptions,
                SnifferSeverity::Error,
                "SnifferInterfaceOptions.pcap_dispatch_batch_size must be between 1 and kMaxPcapDispatchBatchSize.",
                interface.name,
                0,
                {},
                false,
                interface_id);
        }

        if (interface.ring_slots == 0 || interface.ring_slots > kMaxRingSlots) {
            return make_sniffer_error(
                SnifferErrorCode::InvalidOptions,
                SnifferSeverity::Error,
                "SnifferInterfaceOptions.ring_slots must be between 1 and kMaxRingSlots.",
                interface.name,
                0,
                {},
                false,
                interface_id);
        }


        if (!ring_estimate_fits(
                interface.ring_slots,
                static_cast<std::size_t>(interface.snaplen),
                estimated_ring_total)) {
            return make_sniffer_error(
                SnifferErrorCode::InvalidOptions,
                SnifferSeverity::Error,
                "Packet ring memory estimate overflowed.",
                interface.name,
                0,
                {},
                false,
                interface_id);
        }
    }

    if (options.max_total_ring_bytes != 0 && estimated_ring_total > options.max_total_ring_bytes) {
        return make_sniffer_error(
            SnifferErrorCode::MemoryBudgetExceeded,
            SnifferSeverity::Error,
            "Configured packet rings exceed SnifferOptions.max_total_ring_bytes.");
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

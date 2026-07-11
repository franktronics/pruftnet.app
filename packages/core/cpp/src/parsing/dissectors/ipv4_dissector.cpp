#include "parsing/dissectors/ipv4_dissector.hpp"

#include <algorithm>

#include "parsing/dissector_context.hpp"
#include "parsing/dissectors/dissector_states.hpp"

namespace pruftnet::parsing::internal {
namespace {
constexpr std::size_t kMinimumHeaderLength = 20;

std::size_t protocol_span(const PacketView& view, std::size_t logical_length) noexcept {
    return std::min(view.captured_length(), logical_length);
}
} // namespace

DissectionResult dissect_ipv4(DissectorContext& context, const void* opaque, const PacketView& view,
                               std::uint32_t parent) {
    const auto& state = *static_cast<const Ipv4DissectorState*>(opaque);
    const auto first_byte = context.read(view.read_u8(0));
    const auto total_length = context.read(view.read_be16(2));
    const auto ip_node = context.add_protocol(
        state.packet, parent, view,
        total_length ? protocol_span(view, std::max<std::size_t>(*total_length, kMinimumHeaderLength))
                     : view.captured_length());
    if (!ip_node || !first_byte || !total_length || context.stopped()) {
        return {};
    }

    const auto version = static_cast<std::uint8_t>(*first_byte >> 4U);
    const auto header_length = static_cast<std::size_t>(*first_byte & 0x0fU) * 4U;
    const auto dscp_ecn = context.read(view.read_u8(1));
    const auto identification = context.read(view.read_be16(4));
    const auto flags_fragment = context.read(view.read_be16(6));
    const auto ttl = context.read(view.read_u8(8));
    const auto protocol = context.read(view.read_u8(9));
    const auto checksum = context.read(view.read_be16(10));
    const auto source = context.read(view.read_bytes(12, 4));
    const auto destination = context.read(view.read_bytes(16, 4));
    if (!dscp_ecn || !identification || !flags_fragment || !ttl || !protocol || !checksum || !source || !destination) {
        return {};
    }
    if (!context.add_unsigned(state.version, *ip_node, view, 0, 1, version) ||
        !context.add_unsigned(state.header_length, *ip_node, view, 0, 1, header_length) ||
        !context.add_unsigned(state.dscp_ecn, *ip_node, view, 1, 1, *dscp_ecn) ||
        !context.add_unsigned(state.total_length, *ip_node, view, 2, 2, *total_length) ||
        !context.add_unsigned(state.identification, *ip_node, view, 4, 2, *identification) ||
        !context.add_unsigned(state.flags, *ip_node, view, 6, 2, *flags_fragment >> 13U) ||
        !context.add_unsigned(state.fragment_offset, *ip_node, view, 6, 2, *flags_fragment & 0x1fffU) ||
        !context.add_unsigned(state.ttl, *ip_node, view, 8, 1, *ttl) ||
        !context.add_unsigned(state.protocol, *ip_node, view, 9, 1, *protocol) ||
        !context.add_unsigned(state.checksum, *ip_node, view, 10, 2, *checksum) ||
        !context.add_bytes(state.source, *ip_node, view, 12, *source) ||
        !context.add_bytes(state.destination, *ip_node, view, 16, *destination)) {
        return {};
    }
    if (version != 4 || header_length < kMinimumHeaderLength || *total_length < header_length ||
        *total_length > view.reported_length()) {
        context.mark_malformed();
        return {};
    }
    if (header_length > kMinimumHeaderLength) {
        const auto options = context.read(view.read_bytes(kMinimumHeaderLength, header_length - kMinimumHeaderLength));
        if (!options || !context.add_bytes(state.options, *ip_node, view, kMinimumHeaderLength, *options)) {
            return {};
        }
    }
    const auto payload_length = *total_length - header_length;
    const auto payload_result = view.subview(header_length, payload_length, payload_length);
    if (!payload_result.has_value()) {
        context.mark_malformed();
        return {};
    }
    const auto& payload = *payload_result.value();
    if (payload.captured_length() < payload_length) {
        context.mark_partial();
    }
    if ((*flags_fragment & 0x8000U) != 0) {
        context.mark_malformed();
        (void)context.add_unknown(*ip_node, payload, 0, payload_length);
        return {*total_length};
    }
    if ((*flags_fragment & 0x2000U) != 0 || (*flags_fragment & 0x1fffU) != 0) {
        (void)context.add_unknown(*ip_node, payload, 0, payload_length);
        return {*total_length};
    }
    (void)context.dispatch_ipv4_protocol(*protocol, payload, *ip_node);
    return {*total_length};
}

} // namespace pruftnet::parsing::internal

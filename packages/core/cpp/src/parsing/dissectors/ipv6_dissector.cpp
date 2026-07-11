#include "parsing/dissectors/ipv6_dissector.hpp"

#include <algorithm>

#include "parsing/dissector_context.hpp"
#include "parsing/dissectors/dissector_states.hpp"

namespace pruftnet::parsing::internal {
namespace {

constexpr std::size_t kHeaderLength = 40;

bool is_variable_extension(std::uint8_t next) noexcept { return next == 0 || next == 43 || next == 60; }

} // namespace

DissectionResult dissect_ipv6(DissectorContext& context, const void* opaque, const PacketView& view,
                               std::uint32_t parent) {
    const auto& state = *static_cast<const Ipv6DissectorState*>(opaque);
    const auto first_word = context.read(view.read_be32(0));
    const auto payload_length = context.read(view.read_be16(4));
    const auto initial_next = context.read(view.read_u8(6));
    const auto ipv6_node = context.add_protocol(
        state.packet, parent, view,
        payload_length ? std::min(view.captured_length(), kHeaderLength + *payload_length) : view.captured_length());
    if (!ipv6_node || !first_word || !payload_length || !initial_next || context.stopped()) {
        return {};
    }
    const auto hop_limit = context.read(view.read_u8(7));
    const auto source = context.read(view.read_bytes(8, 16));
    const auto destination = context.read(view.read_bytes(24, 16));
    if (!hop_limit || !source || !destination) {
        return {};
    }
    const auto version = *first_word >> 28U;
    if (!context.add_unsigned(state.version, *ipv6_node, view, 0, 1, version) ||
        !context.add_unsigned(state.traffic_class, *ipv6_node, view, 0, 2, (*first_word >> 20U) & 0xffU) ||
        !context.add_unsigned(state.flow_label, *ipv6_node, view, 1, 3, *first_word & 0xfffffU) ||
        !context.add_unsigned(state.payload_length, *ipv6_node, view, 4, 2, *payload_length) ||
        !context.add_unsigned(state.next_header, *ipv6_node, view, 6, 1, *initial_next) ||
        !context.add_unsigned(state.hop_limit, *ipv6_node, view, 7, 1, *hop_limit) ||
        !context.add_bytes(state.source, *ipv6_node, view, 8, *source) ||
        !context.add_bytes(state.destination, *ipv6_node, view, 24, *destination)) {
        return {};
    }
    const auto logical_length = kHeaderLength + *payload_length;
    if (version != 6 || logical_length > view.reported_length() ||
        (*payload_length == 0 && *initial_next != 59)) {
        context.mark_malformed();
        return {};
    }
    const auto payload_result = view.subview(kHeaderLength, *payload_length, *payload_length);
    if (!payload_result.has_value()) {
        context.mark_malformed();
        return {};
    }
    auto payload = *payload_result.value();
    if (payload.captured_length() < *payload_length) {
        context.mark_partial();
    }
    std::uint8_t next = *initial_next;
    std::uint32_t current_parent = *ipv6_node;
    bool first_extension = true;
    while (is_variable_extension(next) || next == 44 || next == 51) {
        if (!context.consume_dissector_call()) {
            return {};
        }
        if (next == 0 && !first_extension) {
            context.mark_malformed();
            (void)context.add_unknown(current_parent, payload, 0, payload.reported_length());
            return {logical_length};
        }
        first_extension = false;
        const auto contained_next = context.read(payload.read_u8(0));
        if (!contained_next) {
            return {};
        }
        std::size_t extension_length = 0;
        if (next == 44) {
            extension_length = 8;
        } else {
            const auto encoded_length = context.read(payload.read_u8(1));
            if (!encoded_length) {
                return {};
            }
            extension_length = next == 51 ? (static_cast<std::size_t>(*encoded_length) + 2U) * 4U
                                          : (static_cast<std::size_t>(*encoded_length) + 1U) * 8U;
            if (next == 51 && extension_length < 12) {
                context.mark_malformed();
                return {};
            }
        }
        if (extension_length > payload.reported_length()) {
            context.mark_malformed();
            return {};
        }
        const auto extension_node = context.add_protocol(state.extension, current_parent, payload,
                                                         payload.captured_length());
        if (!extension_node ||
            !context.add_unsigned(state.extension_type, *extension_node, payload, 0, 0, next,
                                  ParsedNodeFlagGenerated) ||
            !context.add_unsigned(state.extension_next_header, *extension_node, payload, 0, 1, *contained_next) ||
            !context.add_unsigned(state.extension_length, *extension_node, payload, 0, 0, extension_length,
                                  ParsedNodeFlagGenerated)) {
            return {};
        }
        const auto complete = context.read(payload.read_bytes(0, extension_length));
        if (!complete) {
            return {};
        }
        if (next == 44) {
            const auto bits = context.read(payload.read_be16(2));
            const auto identification = context.read(payload.read_be32(4));
            if (!bits || !identification ||
                !context.add_unsigned(state.fragment_offset_encoded, *extension_node, payload, 2, 2,
                                      (*bits >> 3U) & 0x1fffU) ||
                !context.add_unsigned(state.fragment_offset, *extension_node, payload, 2, 2,
                                      ((*bits >> 3U) & 0x1fffU) * 8U) ||
                !context.add_unsigned(state.fragment_reserved, *extension_node, payload, 2, 2,
                                      (*bits >> 1U) & 0x3U) ||
                !context.add_unsigned(state.fragment_more, *extension_node, payload, 3, 1, *bits & 1U) ||
                !context.add_unsigned(state.fragment_identification, *extension_node, payload, 4, 4,
                                      *identification)) {
                return {};
            }
            const auto fragment_data_length = payload.reported_length() - extension_length;
            if ((*bits & 1U) != 0 && fragment_data_length % 8U != 0) {
                context.mark_malformed();
            }
            if (((*bits >> 3U) & 0x1fffU) != 0 || (*bits & 1U) != 0) {
                const auto remainder = payload.subview(extension_length, fragment_data_length, fragment_data_length);
                if (remainder.has_value()) {
                    (void)context.add_unknown(*extension_node, *remainder.value(), 0, fragment_data_length);
                }
                return {logical_length};
            }
        } else if (extension_length > 2 &&
                   !context.add_bytes(state.extension_data, *extension_node, payload, 2, complete->subspan(2))) {
            return {};
        }
        const auto remainder_length = payload.reported_length() - extension_length;
        const auto remainder = payload.subview(extension_length, remainder_length, remainder_length);
        if (!remainder.has_value()) {
            context.mark_malformed();
            return {};
        }
        payload = *remainder.value();
        current_parent = *extension_node;
        next = *contained_next;
    }
    if (next == 59) {
        if (payload.reported_length() != 0) {
            (void)context.add_unknown(current_parent, payload, 0, payload.reported_length());
        }
        return {logical_length};
    }
    (void)context.dispatch_ip_protocol(IpFamily::V6, next, payload, current_parent);
    return {logical_length};
}

} // namespace pruftnet::parsing::internal

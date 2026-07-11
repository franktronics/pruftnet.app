#include "parsing/dissectors/tcp_dissector.hpp"

#include <algorithm>

#include "parsing/dissector_context.hpp"
#include "parsing/dissectors/dissector_states.hpp"

namespace pruftnet::parsing::internal {
namespace {
constexpr std::size_t kMinimumHeaderLength = 20;
}

DissectionResult dissect_tcp(DissectorContext& context, const void* opaque, const PacketView& view,
                              std::uint32_t parent) {
    const auto& state = *static_cast<const TcpDissectorState*>(opaque);
    const auto tcp_node = context.add_protocol(state.segment, parent, view, view.captured_length());
    if (!tcp_node || context.stopped()) {
        return {};
    }
    const auto source_port = context.read(view.read_be16(0));
    const auto destination_port = context.read(view.read_be16(2));
    const auto sequence = context.read(view.read_be32(4));
    const auto acknowledgment = context.read(view.read_be32(8));
    const auto offset_reserved = context.read(view.read_u8(12));
    const auto flags = context.read(view.read_u8(13));
    const auto window = context.read(view.read_be16(14));
    const auto checksum = context.read(view.read_be16(16));
    const auto urgent_pointer = context.read(view.read_be16(18));
    if (!source_port || !destination_port || !sequence || !acknowledgment || !offset_reserved || !flags || !window ||
        !checksum || !urgent_pointer) {
        return {};
    }
    const auto header_length = static_cast<std::size_t>(*offset_reserved >> 4U) * 4U;
    if (!context.add_unsigned(state.source_port, *tcp_node, view, 0, 2, *source_port) ||
        !context.add_unsigned(state.destination_port, *tcp_node, view, 2, 2, *destination_port) ||
        !context.add_unsigned(state.sequence_number, *tcp_node, view, 4, 4, *sequence) ||
        !context.add_unsigned(state.acknowledgment_number, *tcp_node, view, 8, 4, *acknowledgment) ||
        !context.add_unsigned(state.header_length, *tcp_node, view, 12, 1, header_length) ||
        !context.add_unsigned(state.reserved, *tcp_node, view, 12, 1, (*offset_reserved & 0x0eU) >> 1U) ||
        !context.add_unsigned(state.flags, *tcp_node, view, 12, 2,
                              (static_cast<std::uint16_t>(*offset_reserved & 0x01U) << 8U) | *flags) ||
        !context.add_unsigned(state.window, *tcp_node, view, 14, 2, *window) ||
        !context.add_unsigned(state.checksum, *tcp_node, view, 16, 2, *checksum) ||
        !context.add_unsigned(state.urgent_pointer, *tcp_node, view, 18, 2, *urgent_pointer)) {
        return {};
    }
    if (header_length < kMinimumHeaderLength || header_length > view.reported_length()) {
        context.mark_malformed();
        return {};
    }
    if (header_length > kMinimumHeaderLength) {
        const auto options = context.read(view.read_bytes(kMinimumHeaderLength, header_length - kMinimumHeaderLength));
        if (!options || !context.add_bytes(state.options, *tcp_node, view, kMinimumHeaderLength, *options)) {
            return {};
        }
    }
    const auto payload_length = view.reported_length() - header_length;
    const auto available_payload =
        std::min(payload_length,
                 view.captured_length() > header_length ? view.captured_length() - header_length : std::size_t{0});
    if (available_payload < payload_length) {
        context.mark_partial();
    }
    (void)context.add_bytes(state.payload, *tcp_node, view, header_length,
                            view.captured().subspan(std::min(header_length, view.captured_length()),
                                                    available_payload));
    return {view.reported_length()};
}

} // namespace pruftnet::parsing::internal

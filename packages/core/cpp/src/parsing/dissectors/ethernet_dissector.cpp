#include "parsing/dissectors/ethernet_dissector.hpp"

#include <algorithm>

#include "parsing/dissector_context.hpp"
#include "parsing/dissectors/dissector_states.hpp"

namespace pruftnet::parsing::internal {
namespace {
constexpr std::size_t kHeaderLength = 14;
}

DissectionResult dissect_ethernet(DissectorContext& context, const void* opaque, const PacketView& view,
                                   std::uint32_t parent) {
    const auto& state = *static_cast<const EthernetDissectorState*>(opaque);
    const auto ethernet_node = context.add_protocol(state.frame, parent, view, view.captured_length());
    if (!ethernet_node || context.stopped()) {
        return {};
    }
    const auto destination = context.read(view.read_bytes(0, 6));
    const auto source = context.read(view.read_bytes(6, 6));
    const auto type = context.read(view.read_be16(12));
    if (!destination || !source || !type) {
        return {};
    }
    if (!context.add_bytes(state.destination, *ethernet_node, view, 0, *destination) ||
        !context.add_bytes(state.source, *ethernet_node, view, 6, *source) ||
        !context.add_unsigned(state.type, *ethernet_node, view, 12, 2, *type)) {
        return {};
    }

    const auto payload_length = view.reported_length() - kHeaderLength;
    const auto payload_result = view.subview(kHeaderLength, payload_length, payload_length);
    if (!payload_result.has_value()) {
        context.mark_malformed();
        return {};
    }
    const auto& payload = *payload_result.value();
    if (*type > 1500 && *type < 1536) {
        context.mark_malformed();
    }
    if (*type <= 1500 && *type != 0) {
        if (*type > payload_length) {
            context.mark_malformed();
        }
        const auto declared_payload = std::min<std::size_t>(*type, payload_length);
        if (!context.add_unknown(*ethernet_node, payload, 0, declared_payload)) {
            return {};
        }
        if (declared_payload < payload_length) {
            (void)context.add_unknown(*ethernet_node, payload, declared_payload, payload_length - declared_payload);
        }
        return {view.reported_length()};
    }
    const auto child = context.dispatch_ethertype(*type, payload, *ethernet_node);
    if (context.stopped()) {
        return {};
    }
    if (child.consumed_length < payload_length) {
        (void)context.add_unknown(*ethernet_node, payload, child.consumed_length,
                                  payload_length - child.consumed_length);
    }
    return {view.reported_length()};
}

} // namespace pruftnet::parsing::internal

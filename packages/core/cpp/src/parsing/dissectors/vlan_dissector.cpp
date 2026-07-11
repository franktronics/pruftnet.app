#include "parsing/dissectors/vlan_dissector.hpp"

#include "parsing/dissector_context.hpp"
#include "parsing/dissectors/dissector_states.hpp"

namespace pruftnet::parsing::internal {
namespace {
constexpr std::size_t kTagLength = 4;
}

DissectionResult dissect_vlan(DissectorContext& context, const void* opaque, const PacketView& view,
                               std::uint32_t parent) {
    const auto& state = *static_cast<const VlanDissectorState*>(opaque);
    const auto vlan_node = context.add_protocol(state.tag, parent, view, view.captured_length());
    if (!vlan_node || context.stopped()) {
        return {};
    }
    const auto tci = context.read(view.read_be16(0));
    const auto type = context.read(view.read_be16(2));
    if (!tci || !type) {
        return {};
    }
    if (!context.add_unsigned(state.priority, *vlan_node, view, 0, 2, (*tci >> 13U) & 0x7U) ||
        !context.add_unsigned(state.drop_eligible, *vlan_node, view, 0, 2, (*tci >> 12U) & 0x1U) ||
        !context.add_unsigned(state.id, *vlan_node, view, 0, 2, *tci & 0x0fffU) ||
        !context.add_unsigned(state.type, *vlan_node, view, 2, 2, *type)) {
        return {};
    }
    const auto payload_length = view.reported_length() - kTagLength;
    const auto payload = view.subview(kTagLength, payload_length, payload_length);
    if (!payload.has_value()) {
        context.mark_malformed();
        return {};
    }
    const auto child = context.dispatch_ethertype(*type, *payload.value(), *vlan_node);
    if (context.stopped()) {
        return {};
    }
    if (child.consumed_length < payload_length) {
        (void)context.add_unknown(*vlan_node, *payload.value(), child.consumed_length,
                                  payload_length - child.consumed_length);
    }
    return {view.reported_length()};
}

} // namespace pruftnet::parsing::internal

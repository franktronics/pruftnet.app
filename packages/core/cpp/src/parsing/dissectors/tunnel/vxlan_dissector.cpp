#include "parsing/dissectors/tunnel/vxlan_dissector.hpp"

#include <cstddef>
#include <cstdint>

#include "parsing/dissector_context.hpp"

namespace pruftnet::parsing::internal {
namespace {

std::uint32_t decode_be24(std::span<const std::byte> bytes) noexcept {
  return (static_cast<std::uint32_t>(std::to_integer<std::uint8_t>(bytes[0]))
          << 16U) |
         (static_cast<std::uint32_t>(std::to_integer<std::uint8_t>(bytes[1]))
          << 8U) |
         std::to_integer<std::uint8_t>(bytes[2]);
}

bool add_remainder(DissectorContext &context, std::uint32_t parent,
                   const PacketView &payload, DissectionResult child) {
  if (child.consumed_length > payload.reported_length()) {
    context.mark_malformed();
    return true;
  }
  if (child.consumed_length == 0 ||
      child.consumed_length == payload.reported_length()) {
    return true;
  }
  return context.add_unknown(parent, payload, child.consumed_length,
                             payload.reported_length() - child.consumed_length);
}

bool dissect_standard(DissectorContext &context,
                      const VxlanDissectorState &state, const PacketView &view,
                      std::uint32_t node) {
  const auto flags = context.read(view.read_be16(0));
  const auto policy_or_reserved = context.read(view.read_be16(2));
  const auto vni_bytes = context.read(view.read_bytes(4, 3));
  const auto reserved_8 = context.read(view.read_u8(7));
  if (!flags || !policy_or_reserved || !vni_bytes || !reserved_8) {
    return false;
  }
  const auto group_policy = (*flags & 0x8000U) != 0;
  const auto allowed_flags =
      static_cast<std::uint16_t>(group_policy ? 0x8848U : 0x0800U);
  const auto reserved_flags =
      static_cast<std::uint16_t>(*flags & ~allowed_flags);
  const auto vni = decode_be24(*vni_bytes);
  if (!context.add_unsigned(state.flags, node, view, 0, 2, *flags) ||
      !context.add_unsigned(state.group_policy_present, node, view, 0, 2,
                            group_policy) ||
      !context.add_unsigned(state.vni_present, node, view, 0, 2,
                            (*flags & 0x0800U) != 0) ||
      !context.add_unsigned(state.dont_learn, node, view, 1, 1,
                            (*flags & 0x0040U) != 0) ||
      !context.add_unsigned(state.policy_applied, node, view, 1, 1,
                            (*flags & 0x0008U) != 0) ||
      !context.add_unsigned(state.reserved_flags, node, view, 0, 2,
                            reserved_flags) ||
      !(group_policy ? context
                           .add_unsigned(state.group_policy_id, node, view, 2,
                                         2, *policy_or_reserved)
                           .has_value()
                     : context
                           .add_unsigned(state.reserved_16, node, view, 2, 2,
                                         *policy_or_reserved)
                           .has_value()) ||
      !context.add_unsigned(state.vni, node, view, 4, 3, vni) ||
      !context.add_unsigned(state.reserved_8, node, view, 7, 1, *reserved_8)) {
    return false;
  }
  if ((*flags & 0x0800U) == 0 || reserved_flags != 0 ||
      (!group_policy && *policy_or_reserved != 0) || *reserved_8 != 0) {
    context.mark_malformed();
  }

  const auto payload_length = view.reported_length() - 8;
  const auto payload = view.subview(8, payload_length, payload_length);
  if (!payload.has_value()) {
    context.mark_malformed();
    return false;
  }
  if (payload.value()->captured_length() < payload_length) {
    context.mark_partial();
  }
  const auto child = context.dispatch_ethernet(*payload.value(), node);
  return !context.stopped() &&
         add_remainder(context, node, *payload.value(), child);
}

bool dissect_gpe(DissectorContext &context, const VxlanDissectorState &state,
                 const PacketView &view, std::uint32_t node) {
  const auto flags = context.read(view.read_u8(0));
  const auto reserved_16 = context.read(view.read_be16(1));
  const auto next_protocol = context.read(view.read_u8(3));
  const auto vni_bytes = context.read(view.read_bytes(4, 3));
  const auto reserved_8 = context.read(view.read_u8(7));
  if (!flags || !reserved_16 || !next_protocol || !vni_bytes || !reserved_8) {
    return false;
  }
  const auto version = static_cast<std::uint8_t>((*flags >> 4U) & 0x03U);
  const auto instance = (*flags & 0x08U) != 0;
  const auto protocol_present = (*flags & 0x04U) != 0;
  const auto vni = decode_be24(*vni_bytes);
  const auto reserved_flags = static_cast<std::uint8_t>(*flags & 0xc2U);
  if (!context.add_unsigned(state.flags, node, view, 0, 1, *flags) ||
      !context.add_unsigned(state.version, node, view, 0, 1, version) ||
      !context.add_unsigned(state.instance, node, view, 0, 1, instance) ||
      !context.add_unsigned(state.next_protocol_present, node, view, 0, 1,
                            protocol_present) ||
      !context.add_unsigned(state.oam, node, view, 0, 1,
                            (*flags & 0x01U) != 0) ||
      !context.add_unsigned(state.reserved_flags, node, view, 0, 1,
                            reserved_flags) ||
      !context.add_unsigned(state.reserved_16, node, view, 1, 2,
                            *reserved_16) ||
      !context.add_unsigned(state.next_protocol, node, view, 3, 1,
                            *next_protocol) ||
      !context.add_unsigned(state.vni, node, view, 4, 3, vni) ||
      !context.add_unsigned(state.reserved_8, node, view, 7, 1, *reserved_8)) {
    return false;
  }
  if (version != 0 || reserved_flags != 0 || *reserved_16 != 0 ||
      *reserved_8 != 0 || (!instance && vni != 0) ||
      (!protocol_present && *next_protocol != 0)) {
    context.mark_malformed();
  }

  const auto payload_length = view.reported_length() - 8;
  const auto payload = view.subview(8, payload_length, payload_length);
  if (!payload.has_value()) {
    context.mark_malformed();
    return false;
  }
  if (payload.value()->captured_length() < payload_length) {
    context.mark_partial();
  }
  if (!protocol_present) {
    return context.add_unknown(node, *payload.value(), 0, payload_length);
  }
  DissectionResult child;
  switch (*next_protocol) {
  case 1:
    child = context.dispatch_ethertype(0x0800, *payload.value(), node);
    break;
  case 2:
    child = context.dispatch_ethertype(0x86dd, *payload.value(), node);
    break;
  case 3:
    child = context.dispatch_ethernet(*payload.value(), node);
    break;
  case 5:
    child = context.dispatch_ethertype(0x8847, *payload.value(), node);
    break;
  default:
    return context.add_unknown(node, *payload.value(), 0, payload_length);
  }
  return !context.stopped() &&
         add_remainder(context, node, *payload.value(), child);
}

} // namespace

DissectionResult dissect_vxlan(DissectorContext &context, const void *opaque,
                               const PacketView &view, std::uint32_t parent) {
  const auto &state = *static_cast<const VxlanDissectorState *>(opaque);
  const auto node =
      context.add_protocol(state.packet, parent, view, view.captured_length());
  if (!node || context.stopped()) {
    return {};
  }
  if (view.reported_length() < 8) {
    context.mark_malformed();
    return {};
  }
  const bool success = state.flavor == VxlanFlavor::Standard
                           ? dissect_standard(context, state, view, *node)
                           : dissect_gpe(context, state, view, *node);
  return success ? DissectionResult{view.reported_length()}
                 : DissectionResult{};
}

} // namespace pruftnet::parsing::internal

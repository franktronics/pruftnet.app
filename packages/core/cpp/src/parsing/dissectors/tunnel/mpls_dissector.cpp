#include "parsing/dissectors/tunnel/mpls_dissector.hpp"

#include <cstddef>
#include <cstdint>

#include "parsing/dissector_context.hpp"

namespace pruftnet::parsing::internal {
namespace {

bool add_payload(DissectorContext &context, FieldId field, std::uint32_t parent,
                 const PacketView &payload) {
  return payload.captured_length() == 0 ||
         context.add_bytes(field, parent, payload, 0, payload.captured());
}

bool add_remainder(DissectorContext &context, FieldId field,
                   std::uint32_t parent, const PacketView &payload,
                   DissectionResult child) {
  if (child.consumed_length > payload.reported_length()) {
    context.mark_malformed();
    return true;
  }
  if (child.consumed_length == payload.reported_length()) {
    return true;
  }
  if (child.consumed_length == 0) {
    return add_payload(context, field, parent, payload);
  }
  const auto remainder = payload.subview(
      child.consumed_length, payload.reported_length() - child.consumed_length,
      payload.reported_length() - child.consumed_length);
  return remainder.has_value() &&
         add_payload(context, field, parent, *remainder.value());
}

bool dissect_gach(DissectorContext &context, const MplsDissectorState &state,
                  const PacketView &payload, std::uint32_t parent) {
  const auto first = context.read(payload.read_u8(0));
  const auto reserved = context.read(payload.read_u8(1));
  const auto channel_type = context.read(payload.read_be16(2));
  const auto node = context.add_protocol(
      state.gach, parent, payload,
      payload.captured_length() < 4 ? payload.captured_length() : 4);
  if (!first || !reserved || !channel_type || !node) {
    return false;
  }
  const auto indicator = static_cast<std::uint8_t>(*first >> 4U);
  const auto version = static_cast<std::uint8_t>(*first & 0x0fU);
  if (!context.add_unsigned(state.gach_channel_indicator, *node, payload, 0, 1,
                            indicator) ||
      !context.add_unsigned(state.gach_version, *node, payload, 0, 1,
                            version) ||
      !context.add_unsigned(state.gach_reserved, *node, payload, 1, 1,
                            *reserved) ||
      !context.add_unsigned(state.gach_channel_type, *node, payload, 2, 2,
                            *channel_type)) {
    return false;
  }
  if (indicator != 1 || version != 0 || *reserved != 0) {
    context.mark_malformed();
  }
  const auto body_length = payload.reported_length() - 4;
  const auto body = payload.subview(4, body_length, body_length);
  if (!body.has_value()) {
    context.mark_malformed();
    return false;
  }
  if (body.value()->captured_length() < body_length) {
    context.mark_partial();
  }
  DissectionResult child;
  std::uint16_t payload_protocol = 0;
  if (*channel_type == 0x0021) {
    payload_protocol = 0x0800;
    child = context.dispatch_ethertype(payload_protocol, *body.value(), parent);
  } else if (*channel_type == 0x0057) {
    payload_protocol = 0x86dd;
    child = context.dispatch_ethertype(payload_protocol, *body.value(), parent);
  } else {
    return add_payload(context, state.payload, parent, *body.value());
  }
  if (!context.add_unsigned(state.payload_protocol, parent, *body.value(), 0, 0,
                            payload_protocol, ParsedNodeFlagGenerated)) {
    return false;
  }
  return !context.stopped() &&
         add_remainder(context, state.payload, parent, *body.value(), child);
}

} // namespace

DissectionResult dissect_mpls(DissectorContext &context, const void *opaque,
                              const PacketView &view, std::uint32_t parent) {
  const auto &state = *static_cast<const MplsDissectorState *>(opaque);
  const auto node =
      context.add_protocol(state.packet, parent, view, view.captured_length());
  if (!node || context.stopped()) {
    return {};
  }

  std::size_t offset = 0;
  std::uint32_t last_label = 0;
  bool bottom_found = false;
  while (offset < view.reported_length()) {
    if (view.reported_length() - offset < 4) {
      context.mark_malformed();
      (void)context.add_unknown(*node, view, offset,
                                view.reported_length() - offset);
      return {view.reported_length()};
    }
    const auto encoded = context.read(view.read_be32(offset));
    if (!encoded) {
      return {};
    }
    const auto entry_view = view.subview(offset, 4, 4);
    if (!entry_view.has_value()) {
      context.mark_malformed();
      return {};
    }
    const auto entry =
        context.add_protocol(state.entry, *node, *entry_view.value(), 4);
    if (!entry) {
      return {};
    }
    const auto label = *encoded >> 12U;
    const auto traffic_class =
        static_cast<std::uint8_t>((*encoded >> 9U) & 0x07U);
    const auto bottom = ((*encoded >> 8U) & 1U) != 0;
    const auto ttl = static_cast<std::uint8_t>(*encoded & 0xffU);
    if (!context.add_unsigned(state.label, *entry, *entry_view.value(), 0, 4,
                              label) ||
        !context.add_unsigned(state.traffic_class, *entry, *entry_view.value(),
                              0, 4, traffic_class) ||
        !context.add_unsigned(state.bottom_of_stack, *entry,
                              *entry_view.value(), 0, 4, bottom) ||
        !context.add_unsigned(state.ttl, *entry, *entry_view.value(), 0, 4,
                              ttl)) {
      return {};
    }
    if (label == 3 || ((label == 0 || label == 2) && !bottom) ||
        (label == 1 && bottom) || (label == 13 && !bottom)) {
      context.mark_malformed();
    }
    last_label = label;
    offset += 4;
    if (bottom) {
      bottom_found = true;
      break;
    }
  }

  if (!bottom_found) {
    context.mark_malformed();
    return {view.reported_length()};
  }
  const auto payload_length = view.reported_length() - offset;
  if (payload_length == 0) {
    context.mark_malformed();
    return {view.reported_length()};
  }
  const auto payload = view.subview(offset, payload_length, payload_length);
  if (!payload.has_value()) {
    context.mark_malformed();
    return {};
  }
  if (payload.value()->captured_length() < payload_length) {
    context.mark_partial();
  }

  if (last_label == 13) {
    if (!dissect_gach(context, state, *payload.value(), *node)) {
      return {};
    }
    return {view.reported_length()};
  }

  const auto first = context.read(payload.value()->read_u8(0));
  if (!first) {
    return {};
  }
  const auto first_nibble = static_cast<std::uint8_t>(*first >> 4U);
  std::uint16_t payload_protocol = 0;
  if (last_label == 0) {
    payload_protocol = 0x0800;
    if (first_nibble != 4) {
      context.mark_malformed();
    }
  } else if (last_label == 2) {
    payload_protocol = 0x86dd;
    if (first_nibble != 6) {
      context.mark_malformed();
    }
  } else if (first_nibble == 4) {
    payload_protocol = 0x0800;
  } else if (first_nibble == 6) {
    payload_protocol = 0x86dd;
  }
  if (!context.add_unsigned(state.payload_protocol, *node, *payload.value(), 0,
                            0, payload_protocol, ParsedNodeFlagGenerated)) {
    return {};
  }
  if (payload_protocol == 0) {
    if (!add_payload(context, state.payload, *node, *payload.value())) {
      return {};
    }
    return {view.reported_length()};
  }
  const auto child =
      context.dispatch_ethertype(payload_protocol, *payload.value(), *node);
  if (context.stopped() ||
      !add_remainder(context, state.payload, *node, *payload.value(), child)) {
    return {};
  }
  return {view.reported_length()};
}

} // namespace pruftnet::parsing::internal

#include "parsing/dissectors/gre_dissector.hpp"

#include <algorithm>
#include <cstddef>
#include <cstdint>

#include "parsing/dissector_context.hpp"
#include "parsing/dissectors/dissector_states.hpp"
#include "parsing/dissectors/dissector_utils.hpp"

namespace pruftnet::parsing::internal {
namespace {

constexpr std::uint16_t kChecksumPresent = 0x8000;
constexpr std::uint16_t kRoutingPresent = 0x4000;
constexpr std::uint16_t kKeyPresent = 0x2000;
constexpr std::uint16_t kSequencePresent = 0x1000;
constexpr std::uint16_t kStrictSourceRoute = 0x0800;
constexpr std::uint16_t kRecursionControl = 0x0700;
constexpr std::uint16_t kAcknowledgmentPresent = 0x0080;
constexpr std::uint16_t kVersion = 0x0007;
constexpr std::uint16_t kVersionZeroReserved = 0x00f8;
constexpr std::uint16_t kVersionOneReserved = 0x0078;
constexpr std::uint16_t kPppProtocol = 0x880b;

bool add_payload_remainder(DissectorContext &context, std::uint32_t parent,
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

bool dissect_version_zero(DissectorContext &context,
                          const GreDissectorState &state,
                          const PacketView &view, std::uint32_t node,
                          std::uint16_t flags, std::uint16_t protocol_type,
                          std::size_t &offset) {
  if ((flags & kVersionZeroReserved) != 0 ||
      ((flags & kStrictSourceRoute) != 0 && (flags & kRoutingPresent) == 0)) {
    context.mark_malformed();
  }

  if ((flags & (kChecksumPresent | kRoutingPresent)) != 0) {
    const auto checksum = context.read(view.read_be16(offset));
    const auto routing_offset = context.read(view.read_be16(offset + 2));
    if (!checksum || !routing_offset ||
        !context.add_unsigned(state.checksum, node, view, offset, 2,
                              *checksum) ||
        !context.add_unsigned(state.offset, node, view, offset + 2, 2,
                              *routing_offset)) {
      return false;
    }
    if ((flags & kChecksumPresent) != 0 &&
        view.captured_length() >= view.reported_length() &&
        !context.add_unsigned(state.checksum_valid, node, view, offset, 0,
                              internet_checksum_valid(view.captured().first(
                                  view.reported_length())),
                              ParsedNodeFlagGenerated)) {
      return false;
    }
    offset += 4;
  }

  if ((flags & kKeyPresent) != 0) {
    const auto key = context.read(view.read_be32(offset));
    if (!key || !context.add_unsigned(state.key, node, view, offset, 4, *key)) {
      return false;
    }
    offset += 4;
  }

  if ((flags & kSequencePresent) != 0) {
    const auto sequence = context.read(view.read_be32(offset));
    if (!sequence || !context.add_unsigned(state.sequence_number, node, view,
                                           offset, 4, *sequence)) {
      return false;
    }
    offset += 4;
  }

  if ((flags & kRoutingPresent) != 0) {
    bool terminated = false;
    while (offset < view.reported_length()) {
      if (view.reported_length() - offset < 4) {
        context.mark_malformed();
        return false;
      }
      const auto address_family = context.read(view.read_be16(offset));
      const auto route_offset = context.read(view.read_u8(offset + 2));
      const auto route_length = context.read(view.read_u8(offset + 3));
      if (!address_family || !route_offset || !route_length) {
        return false;
      }
      const auto entry_length = 4U + static_cast<std::size_t>(*route_length);
      if (entry_length > view.reported_length() - offset) {
        context.mark_malformed();
        return false;
      }
      const auto entry_view = view.subview(offset, entry_length, entry_length);
      if (!entry_view.has_value()) {
        context.mark_malformed();
        return false;
      }
      const auto entry_node = context.add_protocol(
          state.routing_entry, node, *entry_view.value(),
          std::min(entry_view.value()->captured_length(), entry_length));
      if (!entry_node ||
          !context.add_unsigned(state.routing_address_family, *entry_node,
                                *entry_view.value(), 0, 2, *address_family) ||
          !context.add_unsigned(state.routing_offset, *entry_node,
                                *entry_view.value(), 2, 1, *route_offset) ||
          !context.add_unsigned(state.routing_length, *entry_node,
                                *entry_view.value(), 3, 1, *route_length)) {
        return false;
      }
      if (*route_length != 0) {
        const auto route =
            context.read(entry_view.value()->read_bytes(4, *route_length));
        if (!route || !context.add_bytes(state.routing_information, *entry_node,
                                         *entry_view.value(), 4, *route)) {
          return false;
        }
      }
      offset += entry_length;
      if (*address_family == 0 && *route_length == 0) {
        if (*route_offset != 0) {
          context.mark_malformed();
        }
        terminated = true;
        break;
      }
    }
    if (!terminated) {
      context.mark_malformed();
      return false;
    }
  }

  if (offset > view.reported_length()) {
    context.mark_malformed();
    return false;
  }
  const auto payload_length = view.reported_length() - offset;
  if (payload_length == 0) {
    if (protocol_type != 0) {
      context.mark_malformed();
    }
    return true;
  }
  const auto payload = view.subview(offset, payload_length, payload_length);
  if (!payload.has_value()) {
    context.mark_malformed();
    return false;
  }
  if (payload.value()->captured_length() < payload_length) {
    context.mark_partial();
  }
  const auto child =
      context.dispatch_ethertype(protocol_type, *payload.value(), node);
  return !context.stopped() &&
         add_payload_remainder(context, node, *payload.value(), child);
}

bool dissect_version_one(DissectorContext &context,
                         const GreDissectorState &state, const PacketView &view,
                         std::uint32_t node, std::uint16_t flags,
                         std::uint16_t protocol_type, std::size_t &offset) {
  if (protocol_type != kPppProtocol ||
      (flags & (kChecksumPresent | kRoutingPresent | kStrictSourceRoute |
                kRecursionControl | kVersionOneReserved)) != 0) {
    context.mark_malformed();
  }

  std::size_t declared_payload_length = view.reported_length() - offset;
  if ((flags & kKeyPresent) != 0) {
    const auto payload_length = context.read(view.read_be16(offset));
    const auto call_id = context.read(view.read_be16(offset + 2));
    if (!payload_length || !call_id ||
        !context.add_unsigned(state.payload_length, node, view, offset, 2,
                              *payload_length) ||
        !context.add_unsigned(state.call_id, node, view, offset + 2, 2,
                              *call_id)) {
      return false;
    }
    declared_payload_length = *payload_length;
    offset += 4;
  }
  if ((flags & kSequencePresent) != 0) {
    const auto sequence = context.read(view.read_be32(offset));
    if (!sequence || !context.add_unsigned(state.sequence_number, node, view,
                                           offset, 4, *sequence)) {
      return false;
    }
    offset += 4;
  }
  if ((flags & kAcknowledgmentPresent) != 0) {
    const auto acknowledgment = context.read(view.read_be32(offset));
    if (!acknowledgment ||
        !context.add_unsigned(state.acknowledgment_number, node, view, offset,
                              4, *acknowledgment)) {
      return false;
    }
    offset += 4;
  }
  if (offset > view.reported_length() ||
      declared_payload_length > view.reported_length() - offset) {
    context.mark_malformed();
    return false;
  }
  const auto payload =
      view.subview(offset, declared_payload_length, declared_payload_length);
  if (!payload.has_value()) {
    context.mark_malformed();
    return false;
  }
  if (payload.value()->captured_length() < declared_payload_length) {
    context.mark_partial();
  }
  if (declared_payload_length != 0 &&
      !context.add_unknown(node, *payload.value(), 0,
                           declared_payload_length)) {
    return false;
  }
  const auto trailing_offset = offset + declared_payload_length;
  if (trailing_offset < view.reported_length()) {
    return context.add_unknown(node, view, trailing_offset,
                               view.reported_length() - trailing_offset);
  }
  return true;
}

} // namespace

DissectionResult dissect_gre(DissectorContext &context, const void *opaque,
                             const PacketView &view, std::uint32_t parent) {
  const auto &state = *static_cast<const GreDissectorState *>(opaque);
  const auto flags = context.read(view.read_be16(0));
  const auto protocol_type = context.read(view.read_be16(2));
  const auto node =
      context.add_protocol(state.packet, parent, view, view.captured_length());
  if (!node || !flags || !protocol_type || context.stopped()) {
    return {};
  }

  const auto version = static_cast<std::uint8_t>(*flags & kVersion);
  if (!context.add_unsigned(state.flags, *node, view, 0, 2, *flags) ||
      !context.add_unsigned(state.checksum_present, *node, view, 0, 2,
                            (*flags & kChecksumPresent) != 0) ||
      !context.add_unsigned(state.routing_present, *node, view, 0, 2,
                            (*flags & kRoutingPresent) != 0) ||
      !context.add_unsigned(state.key_present, *node, view, 0, 2,
                            (*flags & kKeyPresent) != 0) ||
      !context.add_unsigned(state.sequence_present, *node, view, 0, 2,
                            (*flags & kSequencePresent) != 0) ||
      !context.add_unsigned(state.strict_source_route, *node, view, 0, 2,
                            (*flags & kStrictSourceRoute) != 0) ||
      !context.add_unsigned(state.recursion_control, *node, view, 0, 2,
                            (*flags & kRecursionControl) >> 8U) ||
      !context.add_unsigned(state.acknowledgment_present, *node, view, 0, 2,
                            (*flags & kAcknowledgmentPresent) != 0) ||
      !context.add_unsigned(state.reserved, *node, view, 0, 2,
                            version == 1 ? *flags & kVersionOneReserved
                                         : *flags & kVersionZeroReserved) ||
      !context.add_unsigned(state.version, *node, view, 0, 2, version) ||
      !context.add_unsigned(state.protocol_type, *node, view, 2, 2,
                            *protocol_type)) {
    return {};
  }

  std::size_t offset = 4;
  bool success = false;
  if (version == 0) {
    success = dissect_version_zero(context, state, view, *node, *flags,
                                   *protocol_type, offset);
  } else if (version == 1) {
    success = dissect_version_one(context, state, view, *node, *flags,
                                  *protocol_type, offset);
  } else {
    context.mark_malformed();
    success = context.add_unknown(*node, view, offset,
                                  view.reported_length() - offset);
  }
  return success ? DissectionResult{view.reported_length()}
                 : DissectionResult{};
}

} // namespace pruftnet::parsing::internal

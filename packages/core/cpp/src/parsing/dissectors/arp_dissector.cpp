#include "parsing/dissectors/arp_dissector.hpp"

#include <algorithm>

#include "parsing/dissector_context.hpp"
#include "parsing/dissectors/dissector_states.hpp"

namespace pruftnet::parsing::internal {

DissectionResult dissect_arp(DissectorContext &context, const void *opaque,
                             const PacketView &view, std::uint32_t parent) {
  const auto &state = *static_cast<const ArpDissectorState *>(opaque);
  const auto hardware_length = context.read(view.read_u8(4));
  const auto protocol_length = context.read(view.read_u8(5));
  const auto operation = context.read(view.read_be16(6));
  const auto logical_length =
      hardware_length && protocol_length
          ? std::size_t{8} + 2U * *hardware_length + 2U * *protocol_length
          : std::size_t{8};
  const auto packet_field =
      operation && (*operation == 3 || *operation == 4)   ? state.reverse_packet
      : operation && (*operation == 8 || *operation == 9) ? state.inverse_packet
                                                          : state.packet;
  const auto arp_node =
      context.add_protocol(packet_field, parent, view,
                           std::min(view.captured_length(), logical_length));
  if (!arp_node || !hardware_length || !protocol_length || !operation ||
      context.stopped()) {
    return {};
  }
  const auto hardware_type = context.read(view.read_be16(0));
  const auto protocol_type = context.read(view.read_be16(2));
  if (!hardware_type || !protocol_type) {
    return {};
  }
  if (!context.add_unsigned(state.hardware_type, *arp_node, view, 0, 2,
                            *hardware_type) ||
      !context.add_unsigned(state.protocol_type, *arp_node, view, 2, 2,
                            *protocol_type) ||
      !context.add_unsigned(state.hardware_length, *arp_node, view, 4, 1,
                            *hardware_length) ||
      !context.add_unsigned(state.protocol_length, *arp_node, view, 5, 1,
                            *protocol_length) ||
      !context.add_unsigned(state.operation, *arp_node, view, 6, 2,
                            *operation)) {
    return {};
  }
  if (logical_length > view.reported_length()) {
    context.mark_malformed();
    return {};
  }
  std::size_t offset = 8;
  const auto add_address = [&](FieldId field, std::size_t length) {
    const auto available =
        offset < view.captured_length()
            ? std::min(length, view.captured_length() - offset)
            : std::size_t{0};
    if (available < length) {
      context.mark_partial();
    }
    const bool added =
        offset > view.captured_length()
            ? true
            : context.add_bytes(field, *arp_node, view, offset,
                                view.captured().subspan(offset, available));
    offset += length;
    return added;
  };
  if (!add_address(state.sender_hardware, *hardware_length) ||
      !add_address(state.sender_protocol, *protocol_length) ||
      !add_address(state.target_hardware, *hardware_length) ||
      !add_address(state.target_protocol, *protocol_length)) {
    return {};
  }
  return {logical_length};
}

} // namespace pruftnet::parsing::internal

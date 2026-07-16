#include "parsing/dissectors/link/linux_cooked_dissector.hpp"

#include <algorithm>

#include "parsing/dissector_context.hpp"

namespace pruftnet::parsing::internal {
namespace {

constexpr std::size_t kAddressStorageLength = 8;
constexpr std::size_t kVersion1HeaderLength = 16;
constexpr std::size_t kVersion2HeaderLength = 20;
constexpr std::uint16_t kMaximumLinuxProtocolType = 1536;

bool add_address(DissectorContext &context,
                 const LinuxCookedDissectorState &state, std::uint32_t parent,
                 const PacketView &view, std::size_t address_length_offset,
                 std::size_t address_length_size, std::size_t address_offset,
                 std::uint16_t address_length) {
  if (address_length > kAddressStorageLength) {
    context.mark_malformed();
  }
  const auto used =
      std::min<std::size_t>(address_length, kAddressStorageLength);
  const auto address = context.read(view.read_bytes(address_offset, used));
  if (!address || !context.add_bytes(state.address, parent, view,
                                     address_offset, *address)) {
    return false;
  }
  const auto padding_length = kAddressStorageLength - used;
  if (padding_length != 0) {
    const auto padding =
        context.read(view.read_bytes(address_offset + used, padding_length));
    if (!padding || !context.add_bytes(state.address_padding, parent, view,
                                       address_offset + used, *padding)) {
      return false;
    }
  }
  return context
      .add_unsigned(state.address_length, parent, view, address_length_offset,
                    address_length_size, address_length)
      .has_value();
}

} // namespace

DissectionResult dissect_linux_cooked(DissectorContext &context,
                                      const void *opaque,
                                      const PacketView &view,
                                      std::uint32_t parent) {
  const auto &state = *static_cast<const LinuxCookedDissectorState *>(opaque);
  const auto header_length =
      state.version == 1 ? kVersion1HeaderLength : kVersion2HeaderLength;
  const auto cooked =
      context.add_protocol(state.packet, parent, view, view.captured_length());
  if (!cooked || context.stopped()) {
    return {};
  }

  std::uint16_t protocol = 0;
  std::uint16_t hardware_type = 0;
  if (state.version == 1) {
    const auto packet_type = context.read(view.read_be16(0));
    const auto hardware = context.read(view.read_be16(2));
    const auto address_length = context.read(view.read_be16(4));
    const auto protocol_type = context.read(view.read_be16(14));
    if (!packet_type || !hardware || !address_length || !protocol_type ||
        !context.add_unsigned(state.version_field, *cooked, view, 0, 0, 1,
                              ParsedNodeFlagGenerated) ||
        !context.add_unsigned(state.packet_type, *cooked, view, 0, 2,
                              *packet_type) ||
        !context.add_unsigned(state.hardware_type, *cooked, view, 2, 2,
                              *hardware) ||
        !add_address(context, state, *cooked, view, 4, 2, 6, *address_length) ||
        !context.add_unsigned(state.protocol, *cooked, view, 14, 2,
                              *protocol_type)) {
      return {};
    }
    protocol = *protocol_type;
    hardware_type = *hardware;
  } else {
    const auto protocol_type = context.read(view.read_be16(0));
    const auto reserved = context.read(view.read_be16(2));
    const auto interface_index = context.read(view.read_be32(4));
    const auto hardware = context.read(view.read_be16(8));
    const auto packet_type = context.read(view.read_u8(10));
    const auto address_length = context.read(view.read_u8(11));
    if (!protocol_type || !reserved || !interface_index || !hardware ||
        !packet_type || !address_length ||
        !context.add_unsigned(state.version_field, *cooked, view, 0, 0, 2,
                              ParsedNodeFlagGenerated) ||
        !context.add_unsigned(state.protocol, *cooked, view, 0, 2,
                              *protocol_type) ||
        !context.add_unsigned(state.reserved, *cooked, view, 2, 2, *reserved) ||
        !context.add_unsigned(state.interface_index, *cooked, view, 4, 4,
                              *interface_index) ||
        !context.add_unsigned(state.hardware_type, *cooked, view, 8, 2,
                              *hardware) ||
        !context.add_unsigned(state.packet_type, *cooked, view, 10, 1,
                              *packet_type) ||
        !add_address(context, state, *cooked, view, 11, 1, 12,
                     *address_length)) {
      return {};
    }
    if (*reserved != 0) {
      context.mark_malformed();
    }
    protocol = *protocol_type;
    hardware_type = *hardware;
  }

  const auto payload_length = view.reported_length() - header_length;
  const auto payload_result =
      view.subview(header_length, payload_length, payload_length);
  if (!payload_result.has_value()) {
    context.mark_malformed();
    return {};
  }
  const auto &payload = *payload_result.value();
  const auto child =
      protocol <= kMaximumLinuxProtocolType
          ? context.dispatch_sll_protocol(hardware_type, protocol, payload,
                                          *cooked)
          : context.dispatch_ethertype(protocol, payload, *cooked);
  if (context.stopped()) {
    return {};
  }
  if (child.consumed_length < payload_length) {
    (void)context.add_unknown(*cooked, payload, child.consumed_length,
                              payload_length - child.consumed_length);
  }
  return {view.reported_length()};
}

} // namespace pruftnet::parsing::internal

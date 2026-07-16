#include "parsing/dissectors/tunnel/geneve_dissector.hpp"

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

} // namespace

DissectionResult dissect_geneve(DissectorContext &context, const void *opaque,
                                const PacketView &view, std::uint32_t parent) {
  const auto &state = *static_cast<const GeneveDissectorState *>(opaque);
  const auto node =
      context.add_protocol(state.packet, parent, view, view.captured_length());
  if (!node || context.stopped()) {
    return {};
  }
  const auto version_options = context.read(view.read_u8(0));
  const auto flags = context.read(view.read_u8(1));
  const auto protocol_type = context.read(view.read_be16(2));
  const auto vni_bytes = context.read(view.read_bytes(4, 3));
  const auto reserved = context.read(view.read_u8(7));
  if (!version_options || !flags || !protocol_type || !vni_bytes || !reserved) {
    return {};
  }
  const auto version = static_cast<std::uint8_t>(*version_options >> 6U);
  const auto option_length =
      static_cast<std::size_t>(*version_options & 0x3fU) * 4U;
  const auto critical_options = (*flags & 0x40U) != 0;
  const auto reserved_flags = static_cast<std::uint8_t>(*flags & 0x3fU);
  const auto vni = decode_be24(*vni_bytes);
  if (!context.add_unsigned(state.version, *node, view, 0, 1, version) ||
      !context.add_unsigned(state.option_length, *node, view, 0, 1,
                            option_length) ||
      !context.add_unsigned(state.flags, *node, view, 1, 1, *flags) ||
      !context.add_unsigned(state.oam, *node, view, 1, 1,
                            (*flags & 0x80U) != 0) ||
      !context.add_unsigned(state.critical_options, *node, view, 1, 1,
                            critical_options) ||
      !context.add_unsigned(state.reserved_flags, *node, view, 1, 1,
                            reserved_flags) ||
      !context.add_unsigned(state.protocol_type, *node, view, 2, 2,
                            *protocol_type) ||
      !context.add_unsigned(state.vni, *node, view, 4, 3, vni) ||
      !context.add_unsigned(state.reserved, *node, view, 7, 1, *reserved)) {
    return {};
  }
  if (version != 0 || reserved_flags != 0 || *reserved != 0 ||
      option_length > view.reported_length() - 8) {
    context.mark_malformed();
    if (option_length > view.reported_length() - 8) {
      return {};
    }
  }

  bool saw_critical_option = false;
  std::size_t option_offset = 8;
  const auto options_end = option_offset + option_length;
  while (option_offset < options_end) {
    if (options_end - option_offset < 4) {
      context.mark_malformed();
      return {};
    }
    const auto option_class = context.read(view.read_be16(option_offset));
    const auto option_type = context.read(view.read_u8(option_offset + 2));
    const auto length_flags = context.read(view.read_u8(option_offset + 3));
    if (!option_class || !option_type || !length_flags) {
      return {};
    }
    const auto option_data_length =
        static_cast<std::size_t>(*length_flags & 0x1fU) * 4U;
    const auto total_length = 4U + option_data_length;
    if (total_length > options_end - option_offset) {
      context.mark_malformed();
      return {};
    }
    const auto option_view =
        view.subview(option_offset, total_length, total_length);
    if (!option_view.has_value()) {
      context.mark_malformed();
      return {};
    }
    const auto option_node =
        context.add_protocol(state.option, *node, *option_view.value(),
                             option_view.value()->captured_length());
    const auto option_critical = (*option_type & 0x80U) != 0;
    const auto option_reserved = static_cast<std::uint8_t>(*length_flags >> 5U);
    if (!option_node ||
        !context.add_unsigned(state.option_class, *option_node,
                              *option_view.value(), 0, 2, *option_class) ||
        !context.add_unsigned(state.option_type, *option_node,
                              *option_view.value(), 2, 1,
                              *option_type & 0x7fU) ||
        !context.add_unsigned(state.option_critical, *option_node,
                              *option_view.value(), 2, 1, option_critical) ||
        !context.add_unsigned(state.option_reserved, *option_node,
                              *option_view.value(), 3, 1, option_reserved) ||
        !context.add_unsigned(state.option_data_length, *option_node,
                              *option_view.value(), 3, 1, option_data_length)) {
      return {};
    }
    if (option_reserved != 0) {
      context.mark_malformed();
    }
    if (option_data_length != 0) {
      const auto data =
          context.read(option_view.value()->read_bytes(4, option_data_length));
      if (!data || !context.add_bytes(state.option_data, *option_node,
                                      *option_view.value(), 4, *data)) {
        return {};
      }
    }
    saw_critical_option = saw_critical_option || option_critical;
    option_offset += total_length;
  }
  if (critical_options != saw_critical_option) {
    context.mark_malformed();
  }

  const auto payload_length = view.reported_length() - options_end;
  const auto payload =
      view.subview(options_end, payload_length, payload_length);
  if (!payload.has_value()) {
    context.mark_malformed();
    return {};
  }
  if (payload.value()->captured_length() < payload_length) {
    context.mark_partial();
  }
  const auto child =
      context.dispatch_ethertype(*protocol_type, *payload.value(), *node);
  if (context.stopped() ||
      !add_remainder(context, *node, *payload.value(), child)) {
    return {};
  }
  return {view.reported_length()};
}

} // namespace pruftnet::parsing::internal

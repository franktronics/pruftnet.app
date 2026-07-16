#include "parsing/dissectors/network/icmpv4_dissector.hpp"

#include <algorithm>

#include "parsing/dissector_context.hpp"
#include "parsing/dissectors/network/icmp_extension.hpp"

namespace pruftnet::parsing::internal {
namespace {

bool add_range(DissectorContext &context, FieldId field, std::uint32_t parent,
               const PacketView &view, std::size_t offset,
               std::size_t logical) {
  const auto available =
      view.captured_length() > offset
          ? std::min(logical, view.captured_length() - offset)
          : std::size_t{0};
  if (available < logical) {
    context.mark_partial();
  }
  if (offset > view.captured_length() || available == 0) {
    return true;
  }
  return context.add_bytes(field, parent, view, offset,
                           view.captured().subspan(offset, available));
}

bool add_available(DissectorContext &context, FieldId field,
                   std::uint32_t parent, const PacketView &view,
                   std::size_t offset) {
  return add_range(
      context, field, parent, view, offset,
      view.reported_length() > offset ? view.reported_length() - offset : 0);
}

bool parse_identifier_sequence(DissectorContext &context,
                               const Icmpv4DissectorState &state,
                               const PacketView &view, std::uint32_t parent) {
  const auto identifier = context.read(view.read_be16(4));
  const auto sequence = context.read(view.read_be16(6));
  return identifier && sequence &&
         context.add_unsigned(state.identifier, parent, view, 4, 2,
                              *identifier) &&
         context.add_unsigned(state.sequence, parent, view, 6, 2, *sequence);
}

bool parse_rfc4884_payload(DissectorContext &context,
                           const Icmpv4DissectorState &state,
                           const PacketView &view, std::uint32_t parent) {
  const auto length_words = context.read(view.read_u8(5));
  if (!length_words ||
      !context.add_unsigned(state.original_datagram_length_words, parent, view,
                            5, 1, *length_words) ||
      !context.add_unsigned(state.original_datagram_length, parent, view, 5, 0,
                            static_cast<std::uint64_t>(*length_words) * 4U,
                            ParsedNodeFlagGenerated)) {
    return false;
  }
  if (*length_words == 0) {
    return add_available(context, state.quoted, parent, view, 8);
  }
  const auto quoted_length = static_cast<std::size_t>(*length_words) * 4U;
  if (quoted_length < 128 || quoted_length > view.reported_length() - 8) {
    context.mark_malformed();
    return false;
  }
  const auto extension_offset = 8 + quoted_length;
  const auto extension_length = view.reported_length() - extension_offset;
  if (extension_length < 8 ||
      !add_range(context, state.quoted, parent, view, 8, quoted_length)) {
    context.mark_malformed();
    return false;
  }
  const auto extension_view_result =
      view.subview(extension_offset, extension_length, extension_length);
  if (!extension_view_result.has_value()) {
    context.mark_malformed();
    return false;
  }
  return dissect_icmp_extension(context, state.extension,
                                *extension_view_result.value(), parent)
      .complete;
}

bool parse_router_advertisement(DissectorContext &context,
                                const Icmpv4DissectorState &state,
                                const PacketView &view, std::uint32_t parent) {
  const auto count = context.read(view.read_u8(4));
  const auto entry_words = context.read(view.read_u8(5));
  const auto lifetime = context.read(view.read_be16(6));
  if (!count || !entry_words || !lifetime ||
      !context.add_unsigned(state.router_address_count, parent, view, 4, 1,
                            *count) ||
      !context.add_unsigned(state.router_entry_size, parent, view, 5, 1,
                            static_cast<std::uint64_t>(*entry_words) * 4U) ||
      !context.add_unsigned(state.router_lifetime, parent, view, 6, 2,
                            *lifetime)) {
    return false;
  }
  if (*entry_words < 2) {
    context.mark_malformed();
    return false;
  }
  const auto entry_length = static_cast<std::size_t>(*entry_words) * 4U;
  const auto entries_length = static_cast<std::size_t>(*count) * entry_length;
  if (entries_length > view.reported_length() - 8) {
    context.mark_malformed();
    return false;
  }
  std::size_t offset = 8;
  for (std::size_t index = 0; index < *count; ++index) {
    if (!context.consume_dissector_call()) {
      return false;
    }
    const auto entry_view_result =
        view.subview(offset, entry_length, entry_length);
    if (!entry_view_result.has_value()) {
      context.mark_malformed();
      return false;
    }
    const auto &entry_view = *entry_view_result.value();
    const auto address = context.read(entry_view.read_bytes(0, 4));
    const auto preference = context.read(entry_view.read_be32(4));
    const auto entry = context.add_protocol(
        state.router_entry, parent, entry_view, entry_view.captured_length());
    if (!address || !preference || !entry ||
        !context.add_bytes(state.router_address, *entry, entry_view, 0,
                           *address) ||
        !context.add_unsigned(state.router_preference, *entry, entry_view, 4, 4,
                              *preference)) {
      return false;
    }
    if (entry_length > 8 && !add_range(context, state.body, *entry, entry_view,
                                       8, entry_length - 8)) {
      return false;
    }
    offset += entry_length;
  }
  return add_available(context, state.body, parent, view, offset);
}

bool parse_extended_echo(DissectorContext &context,
                         const Icmpv4DissectorState &state,
                         const PacketView &view, std::uint32_t parent,
                         std::uint8_t type, std::uint8_t code) {
  const auto identifier = context.read(view.read_be16(4));
  const auto sequence = context.read(view.read_u8(6));
  const auto flags = context.read(view.read_u8(7));
  if (!identifier || !sequence || !flags ||
      !context.add_unsigned(state.identifier, parent, view, 4, 2,
                            *identifier) ||
      !context.add_unsigned(state.extended_sequence, parent, view, 6, 1,
                            *sequence) ||
      !context.add_unsigned(state.extended_flags, parent, view, 7, 1, *flags)) {
    return false;
  }
  if ((type == 42 && (*flags & 0xfeU) != 0) ||
      (type == 43 && (((*flags & 0x18U) != 0) || (code != 0 && *flags != 0) ||
                      (((*flags & 0x03U) != 0) && (*flags & 0x04U) == 0)))) {
    context.mark_malformed();
  }
  if (view.reported_length() == 8) {
    if (type == 42) {
      context.mark_malformed();
      return false;
    }
    return true;
  }
  const auto extension_length = view.reported_length() - 8;
  const auto extension_view_result =
      view.subview(8, extension_length, extension_length);
  if (!extension_view_result.has_value()) {
    context.mark_malformed();
    return false;
  }
  const auto summary = dissect_icmp_extension(
      context, state.extension, *extension_view_result.value(), parent);
  if (type == 42 && summary.complete &&
      summary.interface_identification_objects != 1) {
    context.mark_malformed();
    return false;
  }
  return summary.complete;
}

bool supported_error_code(std::uint8_t type, std::uint8_t code) noexcept {
  return (type == 3 && code <= 15) || (type == 4 && code == 0) ||
         (type == 5 && code <= 3) || (type == 11 && code <= 1) ||
         (type == 12 && code <= 2);
}

bool supported_informational_code(std::uint8_t type,
                                  std::uint8_t code) noexcept {
  return ((type == 0 || type == 8 || (type >= 10 && type <= 18)) &&
          code == 0) ||
         (type == 9 && (code == 0 || code == 16)) ||
         (type == 42 && code == 0) || (type == 43 && code <= 4);
}

} // namespace

DissectionResult dissect_icmpv4(DissectorContext &context, const void *opaque,
                                const PacketView &view, std::uint32_t parent) {
  const auto &state = *static_cast<const Icmpv4DissectorState *>(opaque);
  const auto message =
      context.add_protocol(state.message, parent, view, view.captured_length());
  if (!message || context.stopped()) {
    return {};
  }
  const auto type = context.read(view.read_u8(0));
  const auto code = context.read(view.read_u8(1));
  const auto checksum = context.read(view.read_be16(2));
  if (!type || !code || !checksum ||
      !context.add_unsigned(state.type, *message, view, 0, 1, *type) ||
      !context.add_unsigned(state.code, *message, view, 1, 1, *code) ||
      !context.add_unsigned(state.checksum, *message, view, 2, 2, *checksum)) {
    return {};
  }
  const bool error = supported_error_code(*type, *code);
  const bool informational = supported_informational_code(*type, *code);
  if (!error && !informational) {
    (void)add_available(context, state.body, *message, view, 4);
    return {view.reported_length()};
  }
  if (view.reported_length() < 8) {
    context.mark_malformed();
    return {};
  }
  if (!add_range(context, state.body, *message, view, 4, 4)) {
    return {};
  }

  if (*type == 0 || *type == 8) {
    if (!parse_identifier_sequence(context, state, view, *message) ||
        !add_available(context, state.body, *message, view, 8)) {
      return {};
    }
  } else if (*type == 9) {
    if (!parse_router_advertisement(context, state, view, *message)) {
      return {};
    }
  } else if (*type == 10) {
    // The four bytes following the checksum are reserved.
  } else if (*type == 13 || *type == 14) {
    if (view.reported_length() < 20) {
      context.mark_malformed();
      return {};
    }
    const auto originate = context.read(view.read_be32(8));
    const auto receive = context.read(view.read_be32(12));
    const auto transmit = context.read(view.read_be32(16));
    if (!parse_identifier_sequence(context, state, view, *message) ||
        !originate || !receive || !transmit ||
        !context.add_unsigned(state.originate_timestamp, *message, view, 8, 4,
                              *originate) ||
        !context.add_unsigned(state.receive_timestamp, *message, view, 12, 4,
                              *receive) ||
        !context.add_unsigned(state.transmit_timestamp, *message, view, 16, 4,
                              *transmit) ||
        !add_available(context, state.body, *message, view, 20)) {
      return {};
    }
  } else if (*type == 15 || *type == 16) {
    if (!parse_identifier_sequence(context, state, view, *message) ||
        !add_available(context, state.body, *message, view, 8)) {
      return {};
    }
  } else if (*type == 17 || *type == 18) {
    if (view.reported_length() < 12) {
      context.mark_malformed();
      return {};
    }
    const auto mask = context.read(view.read_bytes(8, 4));
    if (!parse_identifier_sequence(context, state, view, *message) || !mask ||
        !context.add_bytes(state.address_mask, *message, view, 8, *mask) ||
        !add_available(context, state.body, *message, view, 12)) {
      return {};
    }
  } else if (*type == 42 || *type == 43) {
    if (!parse_extended_echo(context, state, view, *message, *type, *code)) {
      return {};
    }
  } else {
    const auto fixed = context.read(view.read_bytes(4, 4));
    if (!fixed) {
      return {};
    }
    if (*type == 5) {
      if (!context.add_bytes(state.gateway, *message, view, 4, *fixed)) {
        return {};
      }
    } else if (*type == 12) {
      const auto pointer = context.read(view.read_u8(4));
      if (!pointer || !context.add_unsigned(state.pointer, *message, view, 4, 1,
                                            *pointer)) {
        return {};
      }
    } else if (*type == 3 && *code == 4) {
      const auto mtu = context.read(view.read_be16(6));
      if (!mtu ||
          !context.add_unsigned(state.mtu, *message, view, 6, 2, *mtu)) {
        return {};
      }
    }
    if ((*type == 3 || *type == 11 || *type == 12)
            ? !parse_rfc4884_payload(context, state, view, *message)
            : !add_available(context, state.quoted, *message, view, 8)) {
      return {};
    }
  }
  return {view.reported_length()};
}

} // namespace pruftnet::parsing::internal

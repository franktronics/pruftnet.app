#include "parsing/dissectors/icmpv6_dissector.hpp"

#include <algorithm>

#include "parsing/dissector_context.hpp"
#include "parsing/dissectors/dissector_states.hpp"
#include "parsing/dissectors/icmp_extension.hpp"
#include "parsing/dissectors/mld_dissector.hpp"

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

bool parse_options(DissectorContext &context, const Icmpv6DissectorState &state,
                   const PacketView &view, std::uint32_t parent,
                   std::size_t start) {
  std::size_t offset = start;
  while (offset < view.reported_length()) {
    if (!context.consume_dissector_call()) {
      return false;
    }
    if (view.reported_length() - offset < 2) {
      context.mark_malformed();
      return false;
    }
    const auto type = context.read(view.read_u8(offset));
    const auto units = context.read(view.read_u8(offset + 1));
    if (!type || !units) {
      return false;
    }
    if (*units == 0) {
      context.mark_malformed();
      return false;
    }
    const auto length = static_cast<std::size_t>(*units) * 8U;
    if (length > view.reported_length() - offset) {
      context.mark_malformed();
      return false;
    }
    const auto option_view_result = view.subview(offset, length, length);
    if (!option_view_result.has_value()) {
      context.mark_malformed();
      return false;
    }
    const auto &option_view = *option_view_result.value();
    const auto option = context.add_protocol(state.option, parent, option_view,
                                             option_view.captured_length());
    if (!option ||
        !context.add_unsigned(state.option_type, *option, option_view, 0, 1,
                              *type) ||
        !context.add_unsigned(state.option_length, *option, option_view, 1, 1,
                              length)) {
      return false;
    }
    if (option_view.captured_length() < length) {
      context.mark_partial();
      if (!add_available(context, state.option_body, *option, option_view, 2)) {
        return false;
      }
      return false;
    }
    const auto complete = option_view.captured();
    if ((*type == 3 && length != 32) || (*type == 5 && length != 8) ||
        (*type == 4 && length < 8)) {
      context.mark_malformed();
      return false;
    }
    if ((*type == 1 || *type == 2) && length > 2) {
      if (!context.add_bytes(state.link_layer_address, *option, option_view, 2,
                             complete.subspan(2))) {
        return false;
      }
    } else if (*type == 3) {
      const auto prefix_length = context.read(option_view.read_u8(2));
      const auto flags = context.read(option_view.read_u8(3));
      const auto valid = context.read(option_view.read_be32(4));
      const auto preferred = context.read(option_view.read_be32(8));
      const auto prefix = context.read(option_view.read_bytes(16, 16));
      if (!prefix_length || !flags || !valid || !preferred || !prefix ||
          !context.add_unsigned(state.prefix_length, *option, option_view, 2, 1,
                                *prefix_length) ||
          !context.add_unsigned(state.prefix_flags, *option, option_view, 3, 1,
                                *flags) ||
          !context.add_unsigned(state.valid_lifetime, *option, option_view, 4,
                                4, *valid) ||
          !context.add_unsigned(state.preferred_lifetime, *option, option_view,
                                8, 4, *preferred) ||
          !context.add_bytes(state.prefix, *option, option_view, 16, *prefix)) {
        return false;
      }
    } else if (*type == 4) {
      if (length > 8 &&
          !context.add_bytes(state.redirected_packet, *option, option_view, 8,
                             complete.subspan(8))) {
        return false;
      }
    } else if (*type == 5) {
      const auto mtu = context.read(option_view.read_be32(4));
      if (!mtu ||
          !context.add_unsigned(state.mtu, *option, option_view, 4, 4, *mtu)) {
        return false;
      }
    } else if (!add_available(context, state.option_body, *option, option_view,
                              2)) {
      return false;
    }
    offset += length;
  }
  return true;
}

bool parse_rfc4884_payload(DissectorContext &context,
                           const Icmpv6DissectorState &state,
                           const PacketView &view, std::uint32_t parent) {
  const auto length_words = context.read(view.read_u8(4));
  const auto reserved = context.read(view.read_bytes(5, 3));
  if (!length_words || !reserved ||
      !context.add_unsigned(state.original_datagram_length_words, parent, view,
                            4, 1, *length_words) ||
      !context.add_unsigned(state.original_datagram_length, parent, view, 4, 0,
                            static_cast<std::uint64_t>(*length_words) * 8U,
                            ParsedNodeFlagGenerated)) {
    return false;
  }
  if (std::any_of(reserved->begin(), reserved->end(),
                  [](std::byte value) { return value != std::byte{0}; })) {
    context.mark_malformed();
  }
  if (*length_words == 0) {
    return add_available(context, state.quoted, parent, view, 8);
  }
  const auto quoted_length = static_cast<std::size_t>(*length_words) * 8U;
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

bool parse_extended_echo(DissectorContext &context,
                         const Icmpv6DissectorState &state,
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
  if ((type == 160 && (*flags & 0xfeU) != 0) ||
      (type == 161 && (((*flags & 0x18U) != 0) || (code != 0 && *flags != 0) ||
                       (((*flags & 0x03U) != 0) && (*flags & 0x04U) == 0)))) {
    context.mark_malformed();
  }
  if (view.reported_length() == 8) {
    if (type == 160) {
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
  if (type == 160 && summary.complete &&
      summary.interface_identification_objects != 1) {
    context.mark_malformed();
    return false;
  }
  return summary.complete;
}

bool supported_error_code(std::uint8_t type, std::uint8_t code) noexcept {
  return (type == 1 && code <= 9) || (type == 2 && code == 0) ||
         (type == 3 && code <= 1) || (type == 4 && code <= 10);
}

bool supported_informational_code(std::uint8_t type,
                                  std::uint8_t code) noexcept {
  return ((type == 128 || type == 129 || (type >= 133 && type <= 137) ||
           type == 141 || type == 142) &&
          code == 0) ||
         (type == 160 && code == 0) || (type == 161 && code <= 4);
}

} // namespace

DissectionResult dissect_icmpv6(DissectorContext &context, const void *opaque,
                                const PacketView &view, std::uint32_t parent) {
  const auto &state = *static_cast<const Icmpv6DissectorState *>(opaque);
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
      !context.add_unsigned(state.checksum, *message, view, 2, 2, *checksum) ||
      !context.add_unsigned(state.informational, *message, view, 0, 0,
                            *type >= 128, ParsedNodeFlagGenerated)) {
    return {};
  }
  if (is_mld_type(*type)) {
    return dissect_mld(context, state.mld, view, *message);
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

  if (*type == 128 || *type == 129) {
    const auto identifier = context.read(view.read_be16(4));
    const auto sequence = context.read(view.read_be16(6));
    if (!identifier || !sequence ||
        !context.add_unsigned(state.identifier, *message, view, 4, 2,
                              *identifier) ||
        !context.add_unsigned(state.sequence, *message, view, 6, 2,
                              *sequence) ||
        !add_available(context, state.body, *message, view, 8)) {
      return {};
    }
  } else if (*type <= 4) {
    if (*type == 2) {
      const auto mtu = context.read(view.read_be32(4));
      if (!mtu ||
          !context.add_unsigned(state.mtu, *message, view, 4, 4, *mtu)) {
        return {};
      }
    } else if (*type == 4) {
      const auto pointer = context.read(view.read_be32(4));
      if (!pointer || !context.add_unsigned(state.pointer, *message, view, 4, 4,
                                            *pointer)) {
        return {};
      }
    }
    if ((*type == 1 || *type == 3)
            ? !parse_rfc4884_payload(context, state, view, *message)
            : !add_available(context, state.quoted, *message, view, 8)) {
      return {};
    }
  } else if (*type == 133 || *type == 141 || *type == 142) {
    if (!parse_options(context, state, view, *message, 8)) {
      return {};
    }
  } else if (*type == 134) {
    if (view.reported_length() < 16) {
      context.mark_malformed();
      return {};
    }
    if (!add_range(context, state.body, *message, view, 8, 8)) {
      return {};
    }
    const auto hop = context.read(view.read_u8(4));
    const auto flags = context.read(view.read_u8(5));
    const auto lifetime = context.read(view.read_be16(6));
    const auto reachable = context.read(view.read_be32(8));
    const auto retrans = context.read(view.read_be32(12));
    if (!hop || !flags || !lifetime || !reachable || !retrans ||
        !context.add_unsigned(state.current_hop_limit, *message, view, 4, 1,
                              *hop) ||
        !context.add_unsigned(state.flags, *message, view, 5, 1, *flags) ||
        !context.add_unsigned(state.router_lifetime, *message, view, 6, 2,
                              *lifetime) ||
        !context.add_unsigned(state.reachable_time, *message, view, 8, 4,
                              *reachable) ||
        !context.add_unsigned(state.retrans_timer, *message, view, 12, 4,
                              *retrans) ||
        !parse_options(context, state, view, *message, 16)) {
      return {};
    }
  } else if (*type >= 135 && *type <= 137) {
    const std::size_t fixed_length = *type == 137 ? 40 : 24;
    if (view.reported_length() < fixed_length) {
      context.mark_malformed();
      return {};
    }
    if (!add_range(context, state.body, *message, view, 8, fixed_length - 8)) {
      return {};
    }
    if (*type == 136) {
      const auto flags = context.read(view.read_be32(4));
      if (!flags ||
          !context.add_unsigned(state.flags, *message, view, 4, 4, *flags)) {
        return {};
      }
    }
    const auto target = context.read(view.read_bytes(8, 16));
    if (!target ||
        !context.add_bytes(state.target, *message, view, 8, *target)) {
      return {};
    }
    if (*type == 137) {
      const auto destination = context.read(view.read_bytes(24, 16));
      if (!destination || !context.add_bytes(state.destination, *message, view,
                                             24, *destination)) {
        return {};
      }
    }
    if (!parse_options(context, state, view, *message, fixed_length)) {
      return {};
    }
  } else if (*type == 160 || *type == 161) {
    if (!parse_extended_echo(context, state, view, *message, *type, *code)) {
      return {};
    }
  }
  return {view.reported_length()};
}

} // namespace pruftnet::parsing::internal

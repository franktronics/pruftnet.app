#include "parsing/dissectors/dhcpv6_dissector.hpp"

#include <cstddef>
#include <cstdint>

#include "parsing/dissector_context.hpp"
#include "parsing/dissectors/dissector_states.hpp"
#include "parsing/dissectors/dissector_utils.hpp"

namespace pruftnet::parsing::internal {
namespace {

constexpr std::size_t kMaximumNestedDepth = 32;
constexpr std::uint8_t kRelayForward = 12;
constexpr std::uint8_t kRelayReply = 13;
constexpr std::uint8_t kMaximumRelayHopCount = 32;

bool parse_message(DissectorContext &context, const Dhcpv6DissectorState &state,
                   const PacketView &view, std::uint32_t parent,
                   std::size_t depth);

bool add_raw(DissectorContext &context, const Dhcpv6DissectorState &state,
             const PacketView &data, std::uint32_t parent) {
  return data.captured_length() == 0 ||
         context.add_bytes(state.option_data, parent, data, 0, data.captured());
}

bool parse_duid(DissectorContext &context, const Dhcpv6DissectorState &state,
                const PacketView &data, std::uint32_t parent) {
  if (data.reported_length() < 2) {
    context.mark_malformed();
    return false;
  }
  const auto type = context.read(data.read_be16(0));
  if (!type) {
    return false;
  }
  const auto duid =
      context.add_protocol(state.duid, parent, data, data.captured_length());
  if (!duid ||
      !context.add_unsigned(state.duid_type, *duid, data, 0, 2, *type)) {
    return false;
  }

  std::size_t identifier_offset = 2;
  switch (*type) {
  case 1: {
    if (data.reported_length() < 8) {
      context.mark_malformed();
      return false;
    }
    const auto hardware = context.read(data.read_be16(2));
    const auto time = context.read(data.read_be32(4));
    if (!hardware || !time ||
        !context.add_unsigned(state.duid_hardware_type, *duid, data, 2, 2,
                              *hardware) ||
        !context.add_unsigned(state.duid_time, *duid, data, 4, 4, *time)) {
      return false;
    }
    identifier_offset = 8;
    break;
  }
  case 2: {
    if (data.reported_length() < 6) {
      context.mark_malformed();
      return false;
    }
    const auto enterprise = context.read(data.read_be32(2));
    if (!enterprise || !context.add_unsigned(state.duid_enterprise, *duid, data,
                                             2, 4, *enterprise)) {
      return false;
    }
    identifier_offset = 6;
    break;
  }
  case 3: {
    if (data.reported_length() < 4) {
      context.mark_malformed();
      return false;
    }
    const auto hardware = context.read(data.read_be16(2));
    if (!hardware || !context.add_unsigned(state.duid_hardware_type, *duid,
                                           data, 2, 2, *hardware)) {
      return false;
    }
    identifier_offset = 4;
    break;
  }
  case 4:
    if (data.reported_length() != 18) {
      context.mark_malformed();
      return false;
    }
    identifier_offset = 2;
    break;
  default:
    break;
  }
  if (identifier_offset == data.reported_length()) {
    context.mark_malformed();
    return false;
  }
  const auto identifier = context.read(data.read_bytes(
      identifier_offset, data.reported_length() - identifier_offset));
  return identifier && context.add_bytes(state.duid_identifier, *duid, data,
                                         identifier_offset, *identifier);
}

bool parse_options(DissectorContext &context, const Dhcpv6DissectorState &state,
                   const PacketView &view, std::uint32_t parent,
                   std::size_t start, std::size_t depth);

bool parse_identity_association(DissectorContext &context,
                                const Dhcpv6DissectorState &state,
                                const PacketView &data, std::uint32_t parent,
                                std::size_t header_length, std::size_t depth) {
  if (data.reported_length() < header_length) {
    context.mark_malformed();
    return false;
  }
  const auto iaid = context.read(data.read_be32(0));
  if (!iaid || !context.add_unsigned(state.iaid, parent, data, 0, 4, *iaid)) {
    return false;
  }
  if (header_length == 12) {
    const auto t1 = context.read(data.read_be32(4));
    const auto t2 = context.read(data.read_be32(8));
    if (!t1 || !t2 ||
        !context.add_unsigned(state.t1, parent, data, 4, 4, *t1) ||
        !context.add_unsigned(state.t2, parent, data, 8, 4, *t2)) {
      return false;
    }
    if (*t1 != 0 && *t2 != 0 && *t1 > *t2) {
      context.mark_malformed();
    }
  }
  return parse_options(context, state, data, parent, header_length, depth + 1);
}

bool parse_address_option(DissectorContext &context,
                          const Dhcpv6DissectorState &state,
                          const PacketView &data, std::uint32_t parent,
                          std::size_t depth) {
  if (data.reported_length() < 24) {
    context.mark_malformed();
    return false;
  }
  const auto address = context.read(data.read_bytes(0, 16));
  const auto preferred = context.read(data.read_be32(16));
  const auto valid = context.read(data.read_be32(20));
  if (!address || !preferred || !valid ||
      !context.add_bytes(state.address, parent, data, 0, *address) ||
      !context.add_unsigned(state.preferred_lifetime, parent, data, 16, 4,
                            *preferred) ||
      !context.add_unsigned(state.valid_lifetime, parent, data, 20, 4,
                            *valid)) {
    return false;
  }
  if (*preferred > *valid) {
    context.mark_malformed();
  }
  return parse_options(context, state, data, parent, 24, depth + 1);
}

bool parse_prefix_option(DissectorContext &context,
                         const Dhcpv6DissectorState &state,
                         const PacketView &data, std::uint32_t parent,
                         std::size_t depth) {
  if (data.reported_length() < 25) {
    context.mark_malformed();
    return false;
  }
  const auto preferred = context.read(data.read_be32(0));
  const auto valid = context.read(data.read_be32(4));
  const auto prefix_length = context.read(data.read_u8(8));
  const auto prefix = context.read(data.read_bytes(9, 16));
  if (!preferred || !valid || !prefix_length || !prefix ||
      !context.add_unsigned(state.preferred_lifetime, parent, data, 0, 4,
                            *preferred) ||
      !context.add_unsigned(state.valid_lifetime, parent, data, 4, 4, *valid) ||
      !context.add_unsigned(state.prefix_length, parent, data, 8, 1,
                            *prefix_length) ||
      !context.add_bytes(state.prefix, parent, data, 9, *prefix)) {
    return false;
  }
  if (*preferred > *valid || *prefix_length > 128) {
    context.mark_malformed();
  }
  return parse_options(context, state, data, parent, 25, depth + 1);
}

bool parse_option_data(DissectorContext &context,
                       const Dhcpv6DissectorState &state, std::uint16_t code,
                       const PacketView &data, std::uint32_t parent,
                       std::size_t depth) {
  const auto exact_u8 = [&](FieldId field) {
    if (data.reported_length() != 1) {
      context.mark_malformed();
      return false;
    }
    const auto value = context.read(data.read_u8(0));
    return value && context.add_unsigned(field, parent, data, 0, 1, *value);
  };
  const auto exact_u16 = [&](FieldId field) {
    if (data.reported_length() != 2) {
      context.mark_malformed();
      return false;
    }
    const auto value = context.read(data.read_be16(0));
    return value && context.add_unsigned(field, parent, data, 0, 2, *value);
  };
  const auto exact_u32 = [&](FieldId field) {
    if (data.reported_length() != 4) {
      context.mark_malformed();
      return false;
    }
    const auto value = context.read(data.read_be32(0));
    return value && context.add_unsigned(field, parent, data, 0, 4, *value);
  };

  switch (code) {
  case 1:
  case 2:
    return parse_duid(context, state, data, parent);
  case 3:
  case 25:
    return parse_identity_association(context, state, data, parent, 12, depth);
  case 4:
    return parse_identity_association(context, state, data, parent, 4, depth);
  case 5:
    return parse_address_option(context, state, data, parent, depth);
  case 6:
    if (data.reported_length() == 0 || data.reported_length() % 2 != 0) {
      context.mark_malformed();
      return false;
    }
    for (std::size_t offset = 0; offset < data.reported_length(); offset += 2) {
      if (!context.consume_dissector_call()) {
        return false;
      }
      const auto value = context.read(data.read_be16(offset));
      if (!value || !context.add_unsigned(state.requested_option, parent, data,
                                          offset, 2, *value)) {
        return false;
      }
    }
    return true;
  case 7:
    return exact_u8(state.preference);
  case 8:
    return exact_u16(state.elapsed_time);
  case 9: {
    if (data.reported_length() == 0 || depth >= kMaximumNestedDepth ||
        !context.consume_dissector_call()) {
      if (data.reported_length() == 0) {
        context.mark_malformed();
      } else if (depth >= kMaximumNestedDepth) {
        context.mark_resource_limit();
      }
      return false;
    }
    const auto relay = context.add_protocol(state.relay_message, parent, data,
                                            data.captured_length());
    return relay && parse_message(context, state, data, *relay, depth + 1);
  }
  case 13: {
    if (data.reported_length() < 2) {
      context.mark_malformed();
      return false;
    }
    const auto status = context.read(data.read_be16(0));
    if (!status ||
        !context.add_unsigned(state.status_code, parent, data, 0, 2, *status)) {
      return false;
    }
    if (data.reported_length() == 2) {
      return true;
    }
    const auto text =
        context.read(data.read_bytes(2, data.reported_length() - 2));
    return text && context.add_string(state.status_message, parent, data, 2,
                                      text->size(), escaped_ascii(*text));
  }
  case 14:
    if (data.reported_length() != 0) {
      context.mark_malformed();
      return false;
    }
    return context
        .add_unsigned(state.rapid_commit, parent, data, 0, 0, 1,
                      ParsedNodeFlagGenerated)
        .has_value();
  case 18:
    if (data.reported_length() == 0) {
      context.mark_malformed();
      return false;
    }
    return context.add_bytes(state.interface_id, parent, data, 0,
                             data.captured());
  case 23:
    if (data.reported_length() == 0 || data.reported_length() % 16 != 0) {
      context.mark_malformed();
      return false;
    }
    for (std::size_t offset = 0; offset < data.reported_length();
         offset += 16) {
      if (!context.consume_dissector_call()) {
        return false;
      }
      const auto address = context.read(data.read_bytes(offset, 16));
      if (!address || !context.add_bytes(state.dns_server, parent, data, offset,
                                         *address)) {
        return false;
      }
    }
    return true;
  case 24:
    return data.reported_length() == 0 ||
           context.add_bytes(state.domain_search, parent, data, 0,
                             data.captured());
  case 26:
    return parse_prefix_option(context, state, data, parent, depth);
  case 32:
    return exact_u32(state.information_refresh_time);
  case 82:
    return exact_u32(state.sol_max_rt);
  case 83:
    return exact_u32(state.inf_max_rt);
  default:
    return add_raw(context, state, data, parent);
  }
}

bool parse_options(DissectorContext &context, const Dhcpv6DissectorState &state,
                   const PacketView &view, std::uint32_t parent,
                   std::size_t start, std::size_t depth) {
  if (depth > kMaximumNestedDepth || start > view.reported_length()) {
    if (depth > kMaximumNestedDepth) {
      context.mark_resource_limit();
    } else {
      context.mark_malformed();
    }
    return false;
  }
  std::size_t offset = start;
  while (offset < view.reported_length()) {
    if (!context.consume_dissector_call()) {
      return false;
    }
    if (view.reported_length() - offset < 4) {
      context.mark_malformed();
      return false;
    }
    const auto code = context.read(view.read_be16(offset));
    const auto length = context.read(view.read_be16(offset + 2));
    if (!code || !length) {
      return false;
    }
    const auto data_length = static_cast<std::size_t>(*length);
    if (data_length > view.reported_length() - offset - 4) {
      context.mark_malformed();
      return false;
    }
    const auto option_result =
        view.subview(offset, 4 + data_length, 4 + data_length);
    if (!option_result.has_value()) {
      context.mark_malformed();
      return false;
    }
    const auto &option_view = *option_result.value();
    const auto option = context.add_protocol(state.option, parent, option_view,
                                             option_view.captured_length());
    if (!option ||
        !context.add_unsigned(state.option_code, *option, option_view, 0, 2,
                              *code) ||
        !context.add_unsigned(state.option_length, *option, option_view, 2, 2,
                              *length)) {
      return false;
    }
    const auto data_result = option_view.subview(4, data_length, data_length);
    if (!data_result.has_value()) {
      context.mark_malformed();
      return false;
    }
    const auto &data = *data_result.value();
    if (data.captured_length() < data.reported_length()) {
      context.mark_partial();
    }
    if (*code == 0) {
      context.mark_malformed();
    }
    if (!parse_option_data(context, state, *code, data, *option, depth)) {
      if (!context.stopped() && !add_raw(context, state, data, *option)) {
        return false;
      }
      return false;
    }
    offset += 4 + data_length;
  }
  return true;
}

// NOLINTNEXTLINE(misc-no-recursion)
bool parse_message(DissectorContext &context, const Dhcpv6DissectorState &state,
                   const PacketView &view, std::uint32_t parent,
                   std::size_t depth) {
  if (depth > kMaximumNestedDepth) {
    context.mark_resource_limit();
    return false;
  }
  const auto message =
      context.add_protocol(state.message, parent, view, view.captured_length());
  if (!message || context.stopped()) {
    return false;
  }
  if (view.reported_length() < 1) {
    context.mark_malformed();
    return false;
  }
  const auto type = context.read(view.read_u8(0));
  if (!type ||
      !context.add_unsigned(state.message_type, *message, view, 0, 1, *type)) {
    return false;
  }

  std::size_t options_offset = 0;
  if (*type == kRelayForward || *type == kRelayReply) {
    if (view.reported_length() < 34) {
      context.mark_malformed();
      return false;
    }
    const auto hop_count = context.read(view.read_u8(1));
    const auto link_address = context.read(view.read_bytes(2, 16));
    const auto peer_address = context.read(view.read_bytes(18, 16));
    if (!hop_count || !link_address || !peer_address ||
        !context.add_unsigned(state.hop_count, *message, view, 1, 1,
                              *hop_count) ||
        !context.add_bytes(state.link_address, *message, view, 2,
                           *link_address) ||
        !context.add_bytes(state.peer_address, *message, view, 18,
                           *peer_address)) {
      return false;
    }
    if (*hop_count > kMaximumRelayHopCount) {
      context.mark_malformed();
    }
    options_offset = 34;
  } else {
    if (view.reported_length() < 4) {
      context.mark_malformed();
      return false;
    }
    const auto transaction = context.read(view.read_bytes(1, 3));
    if (!transaction) {
      return false;
    }
    const auto transaction_id =
        (static_cast<std::uint32_t>(
             std::to_integer<std::uint8_t>((*transaction)[0]))
         << 16U) |
        (static_cast<std::uint32_t>(
             std::to_integer<std::uint8_t>((*transaction)[1]))
         << 8U) |
        std::to_integer<std::uint8_t>((*transaction)[2]);
    if (!context.add_unsigned(state.transaction_id, *message, view, 1, 3,
                              transaction_id)) {
      return false;
    }
    options_offset = 4;
  }
  return parse_options(context, state, view, *message, options_offset, depth);
}

} // namespace

DissectionResult dissect_dhcpv6(DissectorContext &context, const void *opaque,
                                const PacketView &view, std::uint32_t parent) {
  const auto &state = *static_cast<const Dhcpv6DissectorState *>(opaque);
  (void)parse_message(context, state, view, parent, 0);
  return {view.reported_length()};
}

} // namespace pruftnet::parsing::internal

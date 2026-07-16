#include "parsing/dissectors/network/igmp_dissector.hpp"

#include <algorithm>
#include <cstddef>
#include <cstdint>

#include "parsing/dissector_context.hpp"
#include "parsing/dissectors/shared/dissector_utils.hpp"

namespace pruftnet::parsing::internal {
namespace {

std::uint32_t decode_floating_code(std::uint8_t code) noexcept {
  if (code < 128) {
    return code;
  }
  return static_cast<std::uint32_t>((code & 0x0fU) | 0x10U)
         << (((code & 0x70U) >> 4U) + 3U);
}

bool add_trailing(DissectorContext &context, const IgmpDissectorState &state,
                  const PacketView &view, std::uint32_t parent,
                  std::size_t offset) {
  if (offset >= view.captured_length()) {
    return true;
  }
  return context.add_bytes(state.trailing, parent, view, offset,
                           view.captured().subspan(offset));
}

bool add_checksum_status(DissectorContext &context,
                         const IgmpDissectorState &state,
                         const PacketView &view, std::uint32_t parent) {
  if (view.captured_length() < view.reported_length()) {
    context.mark_partial();
    return true;
  }
  const bool valid =
      internet_checksum_valid(view.captured().first(view.reported_length()));
  if (!context.add_unsigned(state.checksum_valid, parent, view, 2, 0, valid,
                            ParsedNodeFlagGenerated)) {
    return false;
  }
  if (!valid) {
    context.mark_malformed();
  }
  return true;
}

bool add_common(DissectorContext &context, const IgmpDissectorState &state,
                const PacketView &view, std::uint32_t parent, std::uint8_t type,
                std::uint8_t version) {
  const auto checksum = context.read(view.read_be16(2));
  if (!checksum ||
      !context.add_unsigned(state.type, parent, view, 0, 1, type) ||
      !context.add_unsigned(state.version, parent, view, 0, 0, version,
                            ParsedNodeFlagGenerated) ||
      !context.add_unsigned(state.checksum, parent, view, 2, 2, *checksum)) {
    return false;
  }
  return add_checksum_status(context, state, view, parent);
}

bool parse_fixed_message(DissectorContext &context,
                         const IgmpDissectorState &state,
                         const PacketView &view, std::uint32_t parent,
                         std::uint8_t type, std::uint8_t version,
                         bool response_code) {
  if (view.reported_length() < 8) {
    context.mark_malformed();
    return false;
  }
  const auto second = context.read(view.read_u8(1));
  const auto group = context.read(view.read_bytes(4, 4));
  if (!second || !group ||
      !add_common(context, state, view, parent, type, version) ||
      !(response_code
            ? context
                  .add_unsigned(state.max_response_code, parent, view, 1, 1,
                                *second)
                  .has_value()
            : context.add_unsigned(state.reserved, parent, view, 1, 1, *second)
                  .has_value()) ||
      !context.add_bytes(state.group_address, parent, view, 4, *group)) {
    return false;
  }
  if (!response_code && *second != 0) {
    context.mark_malformed();
  }
  if (response_code &&
      !context.add_unsigned(state.max_response_time, parent, view, 1, 0,
                            decode_floating_code(*second),
                            ParsedNodeFlagGenerated)) {
    return false;
  }
  if (view.reported_length() != 8) {
    context.mark_malformed();
    return add_trailing(context, state, view, parent, 8);
  }
  return true;
}

bool parse_v3_query(DissectorContext &context, const IgmpDissectorState &state,
                    const PacketView &view, std::uint32_t parent,
                    std::uint8_t type) {
  if (view.reported_length() < 12) {
    context.mark_malformed();
    return false;
  }
  const auto response_code = context.read(view.read_u8(1));
  const auto group = context.read(view.read_bytes(4, 4));
  const auto flags = context.read(view.read_u8(8));
  const auto qqic = context.read(view.read_u8(9));
  const auto source_count = context.read(view.read_be16(10));
  if (!response_code || !group || !flags || !qqic || !source_count ||
      !add_common(context, state, view, parent, type, 3) ||
      !context.add_unsigned(state.max_response_code, parent, view, 1, 1,
                            *response_code) ||
      !context.add_unsigned(state.max_response_time, parent, view, 1, 0,
                            decode_floating_code(*response_code),
                            ParsedNodeFlagGenerated) ||
      !context.add_bytes(state.group_address, parent, view, 4, *group) ||
      !context.add_unsigned(state.reserved, parent, view, 8, 1,
                            (*flags >> 4U) & 0x0fU) ||
      !context.add_unsigned(state.suppress, parent, view, 8, 1,
                            (*flags & 0x08U) != 0) ||
      !context.add_unsigned(state.qrv, parent, view, 8, 1, *flags & 0x07U) ||
      !context.add_unsigned(state.qqic, parent, view, 9, 1, *qqic) ||
      !context.add_unsigned(state.query_interval, parent, view, 9, 0,
                            decode_floating_code(*qqic),
                            ParsedNodeFlagGenerated) ||
      !context.add_unsigned(state.source_count, parent, view, 10, 2,
                            *source_count)) {
    return false;
  }
  if ((*flags & 0xf0U) != 0) {
    context.mark_malformed();
  }
  const auto expected =
      std::size_t{12} + static_cast<std::size_t>(*source_count) * 4U;
  if (expected > view.reported_length()) {
    context.mark_malformed();
    return false;
  }
  for (std::size_t index = 0; index < *source_count; ++index) {
    if (!context.consume_dissector_call()) {
      return false;
    }
    const auto offset = 12 + index * 4;
    const auto source = context.read(view.read_bytes(offset, 4));
    if (!source || !context.add_bytes(state.source_address, parent, view,
                                      offset, *source)) {
      return false;
    }
  }
  if (expected != view.reported_length()) {
    context.mark_malformed();
    return add_trailing(context, state, view, parent, expected);
  }
  return true;
}

bool parse_v3_report(DissectorContext &context, const IgmpDissectorState &state,
                     const PacketView &view, std::uint32_t parent,
                     std::uint8_t type) {
  if (view.reported_length() < 8) {
    context.mark_malformed();
    return false;
  }
  const auto reserved_byte = context.read(view.read_u8(1));
  const auto reserved_word = context.read(view.read_be16(4));
  const auto record_count = context.read(view.read_be16(6));
  if (!reserved_byte || !reserved_word || !record_count ||
      !add_common(context, state, view, parent, type, 3) ||
      !context.add_unsigned(state.reserved, parent, view, 1, 1,
                            *reserved_byte) ||
      !context.add_unsigned(state.reserved, parent, view, 4, 2,
                            *reserved_word) ||
      !context.add_unsigned(state.record_count, parent, view, 6, 2,
                            *record_count)) {
    return false;
  }
  if (*reserved_byte != 0 || *reserved_word != 0) {
    context.mark_malformed();
  }

  std::size_t offset = 8;
  for (std::size_t index = 0; index < *record_count; ++index) {
    if (!context.consume_dissector_call()) {
      return false;
    }
    if (view.reported_length() - offset < 8) {
      context.mark_malformed();
      return false;
    }
    const auto record_type = context.read(view.read_u8(offset));
    const auto aux_units = context.read(view.read_u8(offset + 1));
    const auto source_count = context.read(view.read_be16(offset + 2));
    const auto multicast = context.read(view.read_bytes(offset + 4, 4));
    if (!record_type || !aux_units || !source_count || !multicast) {
      return false;
    }
    const auto source_bytes = static_cast<std::size_t>(*source_count) * 4U;
    const auto aux_bytes = static_cast<std::size_t>(*aux_units) * 4U;
    const auto record_length = std::size_t{8} + source_bytes + aux_bytes;
    if (record_length > view.reported_length() - offset) {
      context.mark_malformed();
      return false;
    }
    const auto record_result =
        view.subview(offset, record_length, record_length);
    if (!record_result.has_value()) {
      context.mark_malformed();
      return false;
    }
    const auto &record_view = *record_result.value();
    const auto record = context.add_protocol(state.record, parent, record_view,
                                             record_view.captured_length());
    if (!record ||
        !context.add_unsigned(state.record_type, *record, record_view, 0, 1,
                              *record_type) ||
        !context.add_unsigned(state.aux_data_length, *record, record_view, 1, 1,
                              aux_bytes) ||
        !context.add_unsigned(state.record_source_count, *record, record_view,
                              2, 2, *source_count) ||
        !context.add_bytes(state.record_multicast_address, *record, record_view,
                           4, *multicast)) {
      return false;
    }
    if (*record_type < 1 || *record_type > 6) {
      context.mark_malformed();
    }
    for (std::size_t source_index = 0; source_index < *source_count;
         ++source_index) {
      if (!context.consume_dissector_call()) {
        return false;
      }
      const auto source_offset = 8 + source_index * 4;
      const auto source =
          context.read(record_view.read_bytes(source_offset, 4));
      if (!source || !context.add_bytes(state.record_source_address, *record,
                                        record_view, source_offset, *source)) {
        return false;
      }
    }
    if (aux_bytes != 0) {
      const auto auxiliary =
          context.read(record_view.read_bytes(8 + source_bytes, aux_bytes));
      if (!auxiliary || !context.add_bytes(state.aux_data, *record, record_view,
                                           8 + source_bytes, *auxiliary)) {
        return false;
      }
    }
    offset += record_length;
  }
  if (offset != view.reported_length()) {
    context.mark_malformed();
    return add_trailing(context, state, view, parent, offset);
  }
  return true;
}

} // namespace

DissectionResult dissect_igmp(DissectorContext &context, const void *opaque,
                              const PacketView &view, std::uint32_t parent) {
  const auto &state = *static_cast<const IgmpDissectorState *>(opaque);
  const auto packet =
      context.add_protocol(state.packet, parent, view, view.captured_length());
  if (!packet || context.stopped()) {
    return {};
  }
  if (view.reported_length() < 1) {
    context.mark_malformed();
    return {};
  }
  const auto type = context.read(view.read_u8(0));
  if (!type) {
    return {};
  }
  switch (*type) {
  case 0x11:
    if (view.reported_length() == 8) {
      const auto response_code = context.read(view.read_u8(1));
      if (!response_code) {
        return {};
      }
      (void)parse_fixed_message(context, state, view, *packet, *type,
                                *response_code == 0 ? 1 : 2, true);
    } else {
      (void)parse_v3_query(context, state, view, *packet, *type);
    }
    break;
  case 0x12:
    (void)parse_fixed_message(context, state, view, *packet, *type, 1, false);
    break;
  case 0x16:
  case 0x17:
    (void)parse_fixed_message(context, state, view, *packet, *type, 2, false);
    break;
  case 0x22:
    (void)parse_v3_report(context, state, view, *packet, *type);
    break;
  default:
    if (!context.add_unsigned(state.type, *packet, view, 0, 1, *type)) {
      return {};
    }
    (void)add_trailing(context, state, view, *packet, 1);
    break;
  }
  return {view.reported_length()};
}

} // namespace pruftnet::parsing::internal

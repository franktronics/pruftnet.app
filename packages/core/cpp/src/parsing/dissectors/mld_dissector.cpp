#include "parsing/dissectors/mld_dissector.hpp"

#include <cstddef>
#include <cstdint>

#include "parsing/dissector_context.hpp"

namespace pruftnet::parsing::internal {
namespace {

std::uint32_t decode_qqic(std::uint8_t code) noexcept {
  if (code < 128) {
    return code;
  }
  return static_cast<std::uint32_t>((code & 0x0fU) | 0x10U)
         << (((code & 0x70U) >> 4U) + 3U);
}

std::uint32_t decode_maximum_response(std::uint16_t code) noexcept {
  if (code < 32768) {
    return code;
  }
  return static_cast<std::uint32_t>((code & 0x0fffU) | 0x1000U)
         << (((code & 0x7000U) >> 12U) + 3U);
}

bool add_trailing(DissectorContext &context, const MldDissectorState &state,
                  const PacketView &view, std::uint32_t parent,
                  std::size_t offset) {
  if (offset >= view.captured_length()) {
    return true;
  }
  return context.add_bytes(state.trailing, parent, view, offset,
                           view.captured().subspan(offset));
}

bool parse_v1(DissectorContext &context, const MldDissectorState &state,
              const PacketView &view, std::uint32_t parent, std::uint8_t type) {
  if (view.reported_length() < 24) {
    context.mark_malformed();
    return false;
  }
  const auto maximum = context.read(view.read_be16(4));
  const auto reserved = context.read(view.read_be16(6));
  const auto multicast = context.read(view.read_bytes(8, 16));
  if (!maximum || !reserved || !multicast ||
      !context.add_unsigned(state.version, parent, view, 0, 0, 1,
                            ParsedNodeFlagGenerated) ||
      !context.add_unsigned(state.maximum_response_code, parent, view, 4, 2,
                            *maximum) ||
      !context.add_unsigned(state.maximum_response_delay, parent, view, 4, 0,
                            *maximum, ParsedNodeFlagGenerated) ||
      !context.add_unsigned(state.reserved, parent, view, 6, 2, *reserved) ||
      !context.add_bytes(state.multicast_address, parent, view, 8,
                         *multicast)) {
    return false;
  }
  if (*reserved != 0 || (type != 130 && *maximum != 0)) {
    context.mark_malformed();
  }
  if (view.reported_length() != 24) {
    context.mark_malformed();
    return add_trailing(context, state, view, parent, 24);
  }
  return true;
}

bool parse_v2_query(DissectorContext &context, const MldDissectorState &state,
                    const PacketView &view, std::uint32_t parent) {
  if (view.reported_length() < 28) {
    context.mark_malformed();
    return false;
  }
  const auto maximum = context.read(view.read_be16(4));
  const auto reserved = context.read(view.read_be16(6));
  const auto multicast = context.read(view.read_bytes(8, 16));
  const auto flags = context.read(view.read_u8(24));
  const auto qqic = context.read(view.read_u8(25));
  const auto source_count = context.read(view.read_be16(26));
  if (!maximum || !reserved || !multicast || !flags || !qqic || !source_count ||
      !context.add_unsigned(state.version, parent, view, 0, 0, 2,
                            ParsedNodeFlagGenerated) ||
      !context.add_unsigned(state.maximum_response_code, parent, view, 4, 2,
                            *maximum) ||
      !context.add_unsigned(state.maximum_response_delay, parent, view, 4, 0,
                            decode_maximum_response(*maximum),
                            ParsedNodeFlagGenerated) ||
      !context.add_unsigned(state.reserved, parent, view, 6, 2, *reserved) ||
      !context.add_bytes(state.multicast_address, parent, view, 8,
                         *multicast) ||
      !context.add_unsigned(state.flags, parent, view, 24, 1, *flags) ||
      !context.add_unsigned(state.suppress, parent, view, 24, 1,
                            (*flags & 0x08U) != 0) ||
      !context.add_unsigned(state.qrv, parent, view, 24, 1, *flags & 0x07U) ||
      !context.add_unsigned(state.qqic, parent, view, 25, 1, *qqic) ||
      !context.add_unsigned(state.query_interval, parent, view, 25, 0,
                            decode_qqic(*qqic), ParsedNodeFlagGenerated) ||
      !context.add_unsigned(state.source_count, parent, view, 26, 2,
                            *source_count)) {
    return false;
  }
  if (*reserved != 0 || (*flags & 0xf0U) != 0) {
    context.mark_malformed();
  }
  const auto expected =
      std::size_t{28} + static_cast<std::size_t>(*source_count) * 16U;
  if (expected > view.reported_length()) {
    context.mark_malformed();
    return false;
  }
  for (std::size_t index = 0; index < *source_count; ++index) {
    if (!context.consume_dissector_call()) {
      return false;
    }
    const auto offset = 28 + index * 16;
    const auto source = context.read(view.read_bytes(offset, 16));
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

bool parse_v2_report(DissectorContext &context, const MldDissectorState &state,
                     const PacketView &view, std::uint32_t parent) {
  if (view.reported_length() < 8) {
    context.mark_malformed();
    return false;
  }
  const auto reserved = context.read(view.read_be16(4));
  const auto record_count = context.read(view.read_be16(6));
  if (!reserved || !record_count ||
      !context.add_unsigned(state.version, parent, view, 0, 0, 2,
                            ParsedNodeFlagGenerated) ||
      !context.add_unsigned(state.reserved, parent, view, 4, 2, *reserved) ||
      !context.add_unsigned(state.record_count, parent, view, 6, 2,
                            *record_count)) {
    return false;
  }
  if (*reserved != 0) {
    context.mark_malformed();
  }

  std::size_t offset = 8;
  for (std::size_t index = 0; index < *record_count; ++index) {
    if (!context.consume_dissector_call()) {
      return false;
    }
    if (view.reported_length() - offset < 20) {
      context.mark_malformed();
      return false;
    }
    const auto record_type = context.read(view.read_u8(offset));
    const auto aux_units = context.read(view.read_u8(offset + 1));
    const auto source_count = context.read(view.read_be16(offset + 2));
    const auto multicast = context.read(view.read_bytes(offset + 4, 16));
    if (!record_type || !aux_units || !source_count || !multicast) {
      return false;
    }
    const auto source_bytes = static_cast<std::size_t>(*source_count) * 16U;
    const auto aux_bytes = static_cast<std::size_t>(*aux_units) * 4U;
    const auto record_length = std::size_t{20} + source_bytes + aux_bytes;
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
      const auto source_offset = 20 + source_index * 16;
      const auto source =
          context.read(record_view.read_bytes(source_offset, 16));
      if (!source || !context.add_bytes(state.record_source_address, *record,
                                        record_view, source_offset, *source)) {
        return false;
      }
    }
    if (aux_bytes != 0) {
      const auto auxiliary =
          context.read(record_view.read_bytes(20 + source_bytes, aux_bytes));
      if (!auxiliary || !context.add_bytes(state.aux_data, *record, record_view,
                                           20 + source_bytes, *auxiliary)) {
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

bool is_mld_type(std::uint8_t type) noexcept {
  return (type >= 130 && type <= 132) || type == 143;
}

DissectionResult dissect_mld(DissectorContext &context,
                             const MldDissectorState &state,
                             const PacketView &view, std::uint32_t parent) {
  const auto message =
      context.add_protocol(state.message, parent, view, view.captured_length());
  if (!message || context.stopped()) {
    return {};
  }
  const auto type = context.read(view.read_u8(0));
  const auto code = context.read(view.read_u8(1));
  if (!type || !code) {
    return {};
  }
  if (*code != 0) {
    context.mark_malformed();
  }
  if (*type == 130) {
    if (view.reported_length() == 24) {
      (void)parse_v1(context, state, view, *message, *type);
    } else {
      (void)parse_v2_query(context, state, view, *message);
    }
  } else if (*type == 131 || *type == 132) {
    (void)parse_v1(context, state, view, *message, *type);
  } else if (*type == 143) {
    (void)parse_v2_report(context, state, view, *message);
  } else {
    context.mark_malformed();
  }
  return {view.reported_length()};
}

} // namespace pruftnet::parsing::internal

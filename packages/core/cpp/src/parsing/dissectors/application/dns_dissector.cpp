#include "parsing/dissectors/application/dns_dissector.hpp"

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <optional>
#include <span>
#include <string>
#include <utility>

#include "parsing/dissector_context.hpp"
#include "parsing/dissectors/shared/dissector_utils.hpp"

namespace pruftnet::parsing::internal {
namespace {

constexpr std::size_t kHeaderLength = 12;
constexpr std::size_t kMaximumWireNameLength = 255;
constexpr std::size_t kMaximumNameComponents = 128;

struct ParsedName {
  std::string value;
  std::size_t consumed = 0;
};

std::string escaped_dns_label(std::span<const std::byte> bytes) {
  auto value = escaped_ascii(bytes);
  for (std::size_t offset = 0;
       (offset = value.find('.', offset)) != std::string::npos;) {
    value.replace(offset, 1, "\\x2e");
    offset += 4;
  }
  return value;
}

std::optional<ParsedName> parse_name(DissectorContext &context,
                                     const PacketView &message,
                                     std::size_t start,
                                     std::size_t source_end) {
  if (start >= source_end || source_end > message.reported_length()) {
    context.mark_malformed();
    return std::nullopt;
  }

  ParsedName result;
  std::array<std::size_t, kMaximumNameComponents> visited{};
  std::size_t visited_count = 0;
  std::size_t cursor = start;
  std::size_t wire_length = 0;
  bool jumped = false;
  bool has_label = false;

  while (!context.stopped()) {
    if (visited_count == visited.size() ||
        std::find(visited.begin(), visited.begin() + visited_count, cursor) !=
            visited.begin() + visited_count) {
      context.mark_malformed();
      return std::nullopt;
    }
    visited[visited_count++] = cursor;

    const auto limit = jumped ? message.reported_length() : source_end;
    if (cursor >= limit) {
      context.mark_malformed();
      return std::nullopt;
    }
    const auto length_octet = context.read(message.read_u8(cursor));
    if (!length_octet) {
      return std::nullopt;
    }

    if ((*length_octet & 0xc0U) == 0xc0U) {
      if (cursor + 2 > limit) {
        context.mark_malformed();
        return std::nullopt;
      }
      const auto pointer_word = context.read(message.read_be16(cursor));
      if (!pointer_word) {
        return std::nullopt;
      }
      const auto target = static_cast<std::size_t>(*pointer_word & 0x3fffU);
      if (target >= cursor || target >= message.reported_length()) {
        context.mark_malformed();
        return std::nullopt;
      }
      if (!jumped) {
        result.consumed += 2;
      }
      cursor = target;
      jumped = true;
      continue;
    }
    if ((*length_octet & 0xc0U) != 0) {
      context.mark_malformed();
      return std::nullopt;
    }
    if (*length_octet == 0) {
      if (!jumped) {
        ++result.consumed;
      }
      if (++wire_length > kMaximumWireNameLength) {
        context.mark_malformed();
        return std::nullopt;
      }
      if (!has_label) {
        result.value = ".";
      }
      return result;
    }

    const auto label_length = static_cast<std::size_t>(*length_octet);
    if (cursor + 1 + label_length > limit ||
        wire_length + 1 + label_length >= kMaximumWireNameLength) {
      context.mark_malformed();
      return std::nullopt;
    }
    const auto label =
        context.read(message.read_bytes(cursor + 1, label_length));
    if (!label) {
      return std::nullopt;
    }
    if (has_label) {
      result.value.push_back('.');
    }
    result.value += escaped_dns_label(*label);
    has_label = true;
    wire_length += 1 + label_length;
    if (!jumped) {
      result.consumed += 1 + label_length;
    }
    cursor += 1 + label_length;
  }
  return std::nullopt;
}

bool add_raw_record_data(DissectorContext &context,
                         const DnsDissectorState &state, std::uint32_t parent,
                         const PacketView &rdata) {
  return rdata.captured_length() == 0 ||
         context.add_bytes(state.record_data, parent, rdata, 0,
                           rdata.captured());
}

bool add_name_value(DissectorContext &context, FieldId field,
                    std::uint32_t parent, const PacketView &message,
                    std::size_t offset, const ParsedName &name) {
  return context.add_string(field, parent, message, offset, name.consumed,
                            name.value);
}

bool parse_name_rdata(DissectorContext &context, const PacketView &message,
                      const PacketView &rdata, std::uint32_t parent,
                      std::size_t rdata_offset, FieldId field) {
  const auto name = parse_name(context, message, rdata_offset,
                               rdata_offset + rdata.reported_length());
  if (!name) {
    return false;
  }
  if (!add_name_value(context, field, parent, message, rdata_offset, *name)) {
    return false;
  }
  if (name->consumed != rdata.reported_length()) {
    context.mark_malformed();
    return false;
  }
  return true;
}

bool parse_txt_rdata(DissectorContext &context, const DnsDissectorState &state,
                     const PacketView &rdata, std::uint32_t parent) {
  std::size_t offset = 0;
  while (offset < rdata.reported_length()) {
    if (!context.consume_dissector_call()) {
      return false;
    }
    const auto length = context.read(rdata.read_u8(offset));
    if (!length) {
      return false;
    }
    const auto text_length = static_cast<std::size_t>(*length);
    if (text_length > rdata.reported_length() - offset - 1) {
      context.mark_malformed();
      return false;
    }
    const auto text = context.read(rdata.read_bytes(offset + 1, text_length));
    if (!text) {
      return false;
    }
    const auto value = escaped_ascii(*text);
    if (!context.add_string(state.text, parent, rdata, offset + 1, text_length,
                            value)) {
      return false;
    }
    offset += 1 + text_length;
  }
  return true;
}

bool parse_soa_rdata(DissectorContext &context, const DnsDissectorState &state,
                     const PacketView &message, const PacketView &rdata,
                     std::uint32_t parent, std::size_t rdata_offset) {
  const auto source_end = rdata_offset + rdata.reported_length();
  const auto mname = parse_name(context, message, rdata_offset, source_end);
  if (!mname || !add_name_value(context, state.soa_mname, parent, message,
                                rdata_offset, *mname)) {
    return false;
  }
  const auto rname_offset = rdata_offset + mname->consumed;
  const auto rname = parse_name(context, message, rname_offset, source_end);
  if (!rname || !add_name_value(context, state.soa_rname, parent, message,
                                rname_offset, *rname)) {
    return false;
  }
  const auto numbers_offset = mname->consumed + rname->consumed;
  if (numbers_offset > rdata.reported_length() ||
      rdata.reported_length() - numbers_offset != 20) {
    context.mark_malformed();
    return false;
  }
  const auto serial = context.read(rdata.read_be32(numbers_offset));
  const auto refresh = context.read(rdata.read_be32(numbers_offset + 4));
  const auto retry = context.read(rdata.read_be32(numbers_offset + 8));
  const auto expire = context.read(rdata.read_be32(numbers_offset + 12));
  const auto minimum = context.read(rdata.read_be32(numbers_offset + 16));
  if (!serial || !refresh || !retry || !expire || !minimum) {
    return false;
  }
  return context.add_unsigned(state.soa_serial, parent, rdata, numbers_offset,
                              4, *serial) &&
         context.add_unsigned(state.soa_refresh, parent, rdata,
                              numbers_offset + 4, 4, *refresh) &&
         context.add_unsigned(state.soa_retry, parent, rdata,
                              numbers_offset + 8, 4, *retry) &&
         context.add_unsigned(state.soa_expire, parent, rdata,
                              numbers_offset + 12, 4, *expire) &&
         context.add_unsigned(state.soa_minimum, parent, rdata,
                              numbers_offset + 16, 4, *minimum);
}

bool parse_opt_rdata(DissectorContext &context, const DnsDissectorState &state,
                     const PacketView &rdata, std::uint32_t parent) {
  std::size_t offset = 0;
  while (offset < rdata.reported_length()) {
    if (!context.consume_dissector_call()) {
      return false;
    }
    if (rdata.reported_length() - offset < 4) {
      context.mark_malformed();
      return false;
    }
    const auto code = context.read(rdata.read_be16(offset));
    const auto length = context.read(rdata.read_be16(offset + 2));
    if (!code || !length) {
      return false;
    }
    const auto option_length = static_cast<std::size_t>(*length);
    if (option_length > rdata.reported_length() - offset - 4) {
      context.mark_malformed();
      return false;
    }
    const auto data = context.read(rdata.read_bytes(offset + 4, option_length));
    if (!data) {
      return false;
    }
    const auto option_view_result = rdata.subview(offset, 4 + option_length);
    if (!option_view_result.has_value()) {
      context.mark_malformed();
      return false;
    }
    const auto &option_view = *option_view_result.value();
    const auto option = context.add_protocol(
        state.edns_option, parent, option_view, option_view.captured_length());
    if (!option ||
        !context.add_unsigned(state.edns_option_code, *option, option_view, 0,
                              2, *code) ||
        !context.add_unsigned(state.edns_option_length, *option, option_view, 2,
                              2, *length) ||
        (option_length != 0 &&
         !context.add_bytes(state.edns_option_data, *option, option_view, 4,
                            *data))) {
      return false;
    }
    offset += 4 + option_length;
  }
  return true;
}

bool parse_rdata(DissectorContext &context, const DnsDissectorState &state,
                 const PacketView &message, const PacketView &rdata,
                 std::uint32_t parent, std::size_t rdata_offset,
                 std::uint16_t type) {
  switch (type) {
  case 1: {
    if (rdata.reported_length() != 4) {
      context.mark_malformed();
      return false;
    }
    const auto address = context.read(rdata.read_bytes(0, 4));
    return address &&
           context.add_bytes(state.address, parent, rdata, 0, *address);
  }
  case 2:
  case 5:
  case 12:
    return parse_name_rdata(context, message, rdata, parent, rdata_offset,
                            state.target);
  case 6:
    return parse_soa_rdata(context, state, message, rdata, parent,
                           rdata_offset);
  case 15: {
    if (rdata.reported_length() < 3) {
      context.mark_malformed();
      return false;
    }
    const auto preference = context.read(rdata.read_be16(0));
    const auto target = parse_name(context, message, rdata_offset + 2,
                                   rdata_offset + rdata.reported_length());
    if (!preference || !target ||
        !context.add_unsigned(state.preference, parent, rdata, 0, 2,
                              *preference) ||
        !add_name_value(context, state.target, parent, message,
                        rdata_offset + 2, *target)) {
      return false;
    }
    if (target->consumed + 2 != rdata.reported_length()) {
      context.mark_malformed();
      return false;
    }
    return true;
  }
  case 16:
  case 99:
    return parse_txt_rdata(context, state, rdata, parent);
  case 28: {
    if (rdata.reported_length() != 16) {
      context.mark_malformed();
      return false;
    }
    const auto address = context.read(rdata.read_bytes(0, 16));
    return address &&
           context.add_bytes(state.address, parent, rdata, 0, *address);
  }
  case 33: {
    if (rdata.reported_length() < 7) {
      context.mark_malformed();
      return false;
    }
    const auto priority = context.read(rdata.read_be16(0));
    const auto weight = context.read(rdata.read_be16(2));
    const auto port = context.read(rdata.read_be16(4));
    const auto target = parse_name(context, message, rdata_offset + 6,
                                   rdata_offset + rdata.reported_length());
    if (!priority || !weight || !port || !target ||
        !context.add_unsigned(state.priority, parent, rdata, 0, 2, *priority) ||
        !context.add_unsigned(state.weight, parent, rdata, 2, 2, *weight) ||
        !context.add_unsigned(state.port, parent, rdata, 4, 2, *port) ||
        !add_name_value(context, state.target, parent, message,
                        rdata_offset + 6, *target)) {
      return false;
    }
    if (target->consumed + 6 != rdata.reported_length()) {
      context.mark_malformed();
      return false;
    }
    return true;
  }
  case 41:
    return parse_opt_rdata(context, state, rdata, parent);
  default:
    return add_raw_record_data(context, state, parent, rdata);
  }
}

std::optional<std::size_t> parse_question(DissectorContext &context,
                                          const DnsDissectorState &state,
                                          const PacketView &message,
                                          std::uint32_t parent,
                                          std::size_t offset) {
  const auto name =
      parse_name(context, message, offset, message.reported_length());
  if (!name) {
    return std::nullopt;
  }
  if (name->consumed > message.reported_length() - offset ||
      message.reported_length() - offset - name->consumed < 4) {
    context.mark_malformed();
    return std::nullopt;
  }
  const auto type_offset = offset + name->consumed;
  const auto type = context.read(message.read_be16(type_offset));
  const auto raw_class = context.read(message.read_be16(type_offset + 2));
  if (!type || !raw_class) {
    return std::nullopt;
  }
  const auto total_length = name->consumed + 4;
  const auto question_view_result = message.subview(offset, total_length);
  if (!question_view_result.has_value()) {
    context.mark_malformed();
    return std::nullopt;
  }
  const auto &question_view = *question_view_result.value();
  const auto question = context.add_protocol(
      state.question, parent, question_view, question_view.captured_length());
  if (!question ||
      !add_name_value(context, state.question_name, *question, message, offset,
                      *name) ||
      !context.add_unsigned(state.question_type, *question, message,
                            type_offset, 2, *type)) {
    return std::nullopt;
  }
  const auto question_class =
      state.flavor == DnsFlavor::Mdns ? *raw_class & 0x7fffU : *raw_class;
  if (!context.add_unsigned(state.question_class, *question, message,
                            type_offset + 2, 2, question_class)) {
    return std::nullopt;
  }
  if (state.flavor == DnsFlavor::Mdns &&
      !context.add_unsigned(state.unicast_response, *question, message,
                            type_offset + 2, 2, (*raw_class & 0x8000U) != 0)) {
    return std::nullopt;
  }
  return offset + total_length;
}

std::optional<std::size_t>
parse_record(DissectorContext &context, const DnsDissectorState &state,
             const PacketView &message, std::uint32_t parent,
             std::size_t offset, std::uint8_t section) {
  const auto name =
      parse_name(context, message, offset, message.reported_length());
  if (!name) {
    return std::nullopt;
  }
  if (name->consumed > message.reported_length() - offset ||
      message.reported_length() - offset - name->consumed < 10) {
    context.mark_malformed();
    return std::nullopt;
  }
  const auto fixed_offset = offset + name->consumed;
  const auto type = context.read(message.read_be16(fixed_offset));
  const auto raw_class = context.read(message.read_be16(fixed_offset + 2));
  const auto ttl = context.read(message.read_be32(fixed_offset + 4));
  const auto length = context.read(message.read_be16(fixed_offset + 8));
  if (!type || !raw_class || !ttl || !length) {
    return std::nullopt;
  }
  const auto rdata_length = static_cast<std::size_t>(*length);
  const auto header_length = name->consumed + 10;
  if (rdata_length > message.reported_length() - offset - header_length) {
    context.mark_malformed();
    return std::nullopt;
  }
  const auto total_length = header_length + rdata_length;
  const auto captured_length =
      std::min(total_length, message.captured_length() - offset);
  const auto record_view_result =
      message.subview(offset, total_length, total_length);
  if (!record_view_result.has_value()) {
    context.mark_malformed();
    return std::nullopt;
  }
  const auto &record_view = *record_view_result.value();
  const auto record =
      context.add_protocol(state.record, parent, record_view, captured_length);
  if (!record ||
      !context.add_unsigned(state.record_section, *record, message, offset, 0,
                            section, ParsedNodeFlagGenerated) ||
      !add_name_value(context, state.record_name, *record, message, offset,
                      *name) ||
      !context.add_unsigned(state.record_type, *record, message, fixed_offset,
                            2, *type)) {
    return std::nullopt;
  }

  const bool mdns_class = state.flavor == DnsFlavor::Mdns && *type != 41;
  const auto record_class = mdns_class ? *raw_class & 0x7fffU : *raw_class;
  if (!context.add_unsigned(state.record_class, *record, message,
                            fixed_offset + 2, 2, record_class) ||
      !context.add_unsigned(state.ttl, *record, message, fixed_offset + 4, 4,
                            *ttl) ||
      !context.add_unsigned(state.record_length, *record, message,
                            fixed_offset + 8, 2, *length)) {
    return std::nullopt;
  }
  if (mdns_class &&
      !context.add_unsigned(state.cache_flush, *record, message,
                            fixed_offset + 2, 2, (*raw_class & 0x8000U) != 0)) {
    return std::nullopt;
  }

  const auto rdata_offset = fixed_offset + 10;
  const auto rdata_result =
      message.subview(rdata_offset, rdata_length, rdata_length);
  if (!rdata_result.has_value()) {
    context.mark_malformed();
    return std::nullopt;
  }
  const auto &rdata = *rdata_result.value();
  if (rdata.captured_length() < rdata.reported_length()) {
    context.mark_partial();
  }

  if (*type == 41) {
    if (name->value != ".") {
      context.mark_malformed();
    }
    if (!context.add_unsigned(state.edns_udp_payload_size, *record, message,
                              fixed_offset + 2, 2, *raw_class) ||
        !context.add_unsigned(state.edns_extended_rcode, *record, message,
                              fixed_offset + 4, 1, *ttl >> 24U) ||
        !context.add_unsigned(state.edns_version, *record, message,
                              fixed_offset + 5, 1, (*ttl >> 16U) & 0xffU) ||
        !context.add_unsigned(state.edns_flags, *record, message,
                              fixed_offset + 6, 2, *ttl & 0xffffU)) {
      return std::nullopt;
    }
  }

  if (!parse_rdata(context, state, message, rdata, *record, rdata_offset,
                   *type) &&
      !context.stopped() &&
      !add_raw_record_data(context, state, *record, rdata)) {
    return std::nullopt;
  }
  return offset + total_length;
}

bool add_dns_header(DissectorContext &context, const DnsDissectorState &state,
                    const PacketView &view, std::uint32_t parent,
                    std::uint16_t id, std::uint16_t flags,
                    std::uint16_t question_count, std::uint16_t answer_count,
                    std::uint16_t authority_count,
                    std::uint16_t additional_count) {
  if (!context.add_unsigned(state.id, parent, view, 0, 2, id) ||
      !context.add_unsigned(state.flags, parent, view, 2, 2, flags) ||
      !context.add_unsigned(state.response, parent, view, 2, 2,
                            (flags & 0x8000U) != 0) ||
      !context.add_unsigned(state.opcode, parent, view, 2, 2,
                            (flags >> 11U) & 0x0fU) ||
      !context.add_unsigned(state.truncated, parent, view, 2, 2,
                            (flags & 0x0200U) != 0) ||
      !context.add_unsigned(state.rcode, parent, view, 2, 2, flags & 0x0fU) ||
      !context.add_unsigned(state.question_count, parent, view, 4, 2,
                            question_count) ||
      !context.add_unsigned(state.answer_count, parent, view, 6, 2,
                            answer_count) ||
      !context.add_unsigned(state.authority_count, parent, view, 8, 2,
                            authority_count) ||
      !context.add_unsigned(state.additional_count, parent, view, 10, 2,
                            additional_count)) {
    return false;
  }

  if (state.flavor == DnsFlavor::Llmnr) {
    if (!context.add_unsigned(state.conflict, parent, view, 2, 2,
                              (flags & 0x0400U) != 0) ||
        !context.add_unsigned(state.tentative, parent, view, 2, 2,
                              (flags & 0x0100U) != 0)) {
      return false;
    }
    if ((flags & 0x00f0U) != 0 || (flags & 0x7800U) != 0) {
      context.mark_malformed();
    }
    return true;
  }

  if (!context.add_unsigned(state.authoritative, parent, view, 2, 2,
                            (flags & 0x0400U) != 0) ||
      !context.add_unsigned(state.recursion_desired, parent, view, 2, 2,
                            (flags & 0x0100U) != 0) ||
      !context.add_unsigned(state.recursion_available, parent, view, 2, 2,
                            (flags & 0x0080U) != 0) ||
      !context.add_unsigned(state.authenticated_data, parent, view, 2, 2,
                            (flags & 0x0020U) != 0) ||
      !context.add_unsigned(state.checking_disabled, parent, view, 2, 2,
                            (flags & 0x0010U) != 0)) {
    return false;
  }
  if (state.flavor == DnsFlavor::Dns && (flags & 0x0040U) != 0) {
    context.mark_malformed();
  }
  return true;
}

void dissect_dns_message(DissectorContext &context,
                         const DnsDissectorState &state, const PacketView &view,
                         std::uint32_t parent) {
  const auto message =
      context.add_protocol(state.message, parent, view, view.captured_length());
  if (!message || context.stopped()) {
    return;
  }
  if (view.reported_length() < kHeaderLength) {
    context.mark_malformed();
    if (view.captured_length() != 0) {
      (void)context.add_bytes(state.trailing, *message, view, 0,
                              view.captured());
    }
    return;
  }

  const auto id = context.read(view.read_be16(0));
  const auto flags = context.read(view.read_be16(2));
  const auto question_count = context.read(view.read_be16(4));
  const auto answer_count = context.read(view.read_be16(6));
  const auto authority_count = context.read(view.read_be16(8));
  const auto additional_count = context.read(view.read_be16(10));
  if (!id || !flags || !question_count || !answer_count || !authority_count ||
      !additional_count ||
      !add_dns_header(context, state, view, *message, *id, *flags,
                      *question_count, *answer_count, *authority_count,
                      *additional_count)) {
    return;
  }

  std::size_t offset = kHeaderLength;
  for (std::size_t index = 0; index < *question_count; ++index) {
    if (!context.consume_dissector_call()) {
      return;
    }
    const auto next = parse_question(context, state, view, *message, offset);
    if (!next) {
      return;
    }
    offset = *next;
  }

  const std::array<std::pair<std::uint16_t, std::uint8_t>, 3> sections{{
      {*answer_count, 1},
      {*authority_count, 2},
      {*additional_count, 3},
  }};
  for (const auto [count, section] : sections) {
    for (std::size_t index = 0; index < count; ++index) {
      if (!context.consume_dissector_call()) {
        return;
      }
      const auto next =
          parse_record(context, state, view, *message, offset, section);
      if (!next) {
        return;
      }
      offset = *next;
    }
  }

  if (offset < view.reported_length()) {
    context.mark_malformed();
    if (offset < view.captured_length()) {
      (void)context.add_bytes(state.trailing, *message, view, offset,
                              view.captured().subspan(offset));
    }
  }
}

DissectionResult dissect_dns_tcp(DissectorContext &context,
                                 const DnsDissectorState &state,
                                 const PacketView &view, std::uint32_t parent) {
  const auto stream = context.add_protocol(state.tcp_stream, parent, view,
                                           view.captured_length());
  if (!stream || context.stopped()) {
    return {};
  }

  std::size_t offset = 0;
  while (offset < view.captured_length()) {
    if (!context.consume_dissector_call()) {
      return {};
    }
    if (view.captured_length() - offset < 2) {
      (void)context.add_bytes(state.trailing, *stream, view, offset,
                              view.captured().subspan(offset));
      break;
    }
    const auto length = context.read(view.read_be16(offset));
    if (!length || !context.add_unsigned(state.tcp_length, *stream, view,
                                         offset, 2, *length)) {
      return {};
    }
    if (*length == 0) {
      context.mark_malformed();
      offset += 2;
      continue;
    }
    const auto message_offset = offset + 2;
    const auto available = view.captured_length() - message_offset;
    if (available < *length) {
      if (available != 0) {
        (void)context.add_bytes(
            state.trailing, *stream, view, message_offset,
            view.captured().subspan(message_offset, available));
      }
      break;
    }
    const auto message_result = view.subview(message_offset, *length, *length);
    if (!message_result.has_value()) {
      context.mark_malformed();
      return {};
    }
    dissect_dns_message(context, state, *message_result.value(), *stream);
    if (context.stopped()) {
      return {};
    }
    offset = message_offset + *length;
  }
  return {offset};
}

} // namespace

DissectionResult dissect_dns(DissectorContext &context, const void *opaque,
                             const PacketView &view, std::uint32_t parent) {
  const auto &state = *static_cast<const DnsDissectorState *>(opaque);
  if (state.tcp) {
    return dissect_dns_tcp(context, state, view, parent);
  }
  dissect_dns_message(context, state, view, parent);
  return {view.reported_length()};
}

} // namespace pruftnet::parsing::internal

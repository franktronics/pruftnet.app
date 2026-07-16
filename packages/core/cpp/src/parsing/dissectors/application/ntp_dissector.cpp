#include "parsing/dissectors/application/ntp_dissector.hpp"

#include <algorithm>
#include <bit>
#include <cstddef>
#include <cstdint>

#include "parsing/dissector_context.hpp"

namespace pruftnet::parsing::internal {
namespace {

bool add_trailing(DissectorContext &context, const NtpDissectorState &state,
                  const PacketView &view, std::uint32_t parent,
                  std::size_t offset, std::size_t length) {
  if (length == 0 || offset >= view.captured_length()) {
    return true;
  }
  const auto available = std::min(length, view.captured_length() - offset);
  return context.add_bytes(state.trailing, parent, view, offset,
                           view.captured().subspan(offset, available));
}

bool parse_authentication(DissectorContext &context,
                          const NtpDissectorState &state,
                          const PacketView &view, std::uint32_t parent,
                          std::size_t offset) {
  if (offset == view.reported_length()) {
    return true;
  }
  const auto remaining = view.reported_length() - offset;
  if (remaining < 4) {
    context.mark_malformed();
    return add_trailing(context, state, view, parent, offset, remaining);
  }
  const auto key_id = context.read(view.read_be32(offset));
  if (!key_id ||
      !context.add_unsigned(state.key_id, parent, view, offset, 4, *key_id)) {
    return false;
  }
  if (remaining == 4) {
    return true;
  }
  const auto digest = context.read(view.read_bytes(offset + 4, remaining - 4));
  return digest &&
         context.add_bytes(state.digest, parent, view, offset + 4, *digest);
}

bool parse_standard(DissectorContext &context, const NtpDissectorState &state,
                    const PacketView &view, std::uint32_t parent,
                    std::uint8_t flags) {
  if (view.reported_length() < 48) {
    context.mark_malformed();
    return false;
  }
  const auto stratum = context.read(view.read_u8(1));
  const auto poll = context.read(view.read_u8(2));
  const auto precision = context.read(view.read_u8(3));
  const auto root_delay = context.read(view.read_be32(4));
  const auto root_dispersion = context.read(view.read_be32(8));
  const auto reference_id = context.read(view.read_bytes(12, 4));
  const auto reference_timestamp = context.read(view.read_be64(16));
  const auto origin_timestamp = context.read(view.read_be64(24));
  const auto receive_timestamp = context.read(view.read_be64(32));
  const auto transmit_timestamp = context.read(view.read_be64(40));
  if (!stratum || !poll || !precision || !root_delay || !root_dispersion ||
      !reference_id || !reference_timestamp || !origin_timestamp ||
      !receive_timestamp || !transmit_timestamp ||
      !context.add_unsigned(state.leap_indicator, parent, view, 0, 1,
                            flags >> 6U) ||
      !context.add_unsigned(state.stratum, parent, view, 1, 1, *stratum) ||
      !context.add_signed(state.poll, parent, view, 2, 1,
                          std::bit_cast<std::int8_t>(*poll)) ||
      !context.add_signed(state.precision, parent, view, 3, 1,
                          std::bit_cast<std::int8_t>(*precision)) ||
      !context.add_signed(state.root_delay, parent, view, 4, 4,
                          std::bit_cast<std::int32_t>(*root_delay)) ||
      !context.add_unsigned(state.root_dispersion, parent, view, 8, 4,
                            *root_dispersion) ||
      !context.add_bytes(state.reference_id, parent, view, 12, *reference_id) ||
      !context.add_unsigned(state.reference_timestamp, parent, view, 16, 8,
                            *reference_timestamp) ||
      !context.add_unsigned(state.origin_timestamp, parent, view, 24, 8,
                            *origin_timestamp) ||
      !context.add_unsigned(state.receive_timestamp, parent, view, 32, 8,
                            *receive_timestamp) ||
      !context.add_unsigned(state.transmit_timestamp, parent, view, 40, 8,
                            *transmit_timestamp)) {
    return false;
  }

  std::size_t extensions_end = 48;
  std::size_t last_extension_length = 0;
  while (view.reported_length() - extensions_end >= 16) {
    const auto length = context.read(view.read_be16(extensions_end + 2));
    if (!length) {
      return false;
    }
    const auto extension_length = static_cast<std::size_t>(*length);
    if (extension_length < 16 || extension_length % 4 != 0 ||
        extension_length > view.reported_length() - extensions_end) {
      break;
    }
    extensions_end += extension_length;
    last_extension_length = extension_length;
  }

  const auto initial_auth_length = view.reported_length() - extensions_end;
  if (initial_auth_length != 0 && initial_auth_length < 20 &&
      last_extension_length != 0) {
    bool crypto_nak = false;
    if (initial_auth_length == 4) {
      const auto key_id = context.read(view.read_be32(extensions_end));
      if (!key_id) {
        return false;
      }
      crypto_nak = *key_id == 0;
    }
    if (!crypto_nak) {
      extensions_end -= last_extension_length;
    }
  }

  std::size_t offset = 48;
  while (offset < extensions_end) {
    if (!context.consume_dissector_call()) {
      return false;
    }
    const auto type = context.read(view.read_be16(offset));
    const auto length = context.read(view.read_be16(offset + 2));
    if (!type || !length) {
      return false;
    }
    const auto extension_length = static_cast<std::size_t>(*length);
    const auto extension_result =
        view.subview(offset, extension_length, extension_length);
    if (!extension_result.has_value()) {
      context.mark_malformed();
      return false;
    }
    const auto &extension_view = *extension_result.value();
    const auto extension =
        context.add_protocol(state.extension, parent, extension_view,
                             extension_view.captured_length());
    if (!extension ||
        !context.add_unsigned(state.extension_type, *extension, extension_view,
                              0, 2, *type) ||
        !context.add_unsigned(state.extension_length, *extension,
                              extension_view, 2, 2, *length)) {
      return false;
    }
    if (extension_length > 4) {
      const auto value =
          context.read(extension_view.read_bytes(4, extension_length - 4));
      if (!value || !context.add_bytes(state.extension_value, *extension,
                                       extension_view, 4, *value)) {
        return false;
      }
    }
    offset += extension_length;
  }
  return parse_authentication(context, state, view, parent, extensions_end);
}

bool parse_control(DissectorContext &context, const NtpDissectorState &state,
                   const PacketView &view, std::uint32_t parent,
                   std::uint8_t flags) {
  if (view.reported_length() < 12) {
    context.mark_malformed();
    return false;
  }
  const auto control_flags = context.read(view.read_u8(1));
  const auto sequence = context.read(view.read_be16(2));
  const auto status = context.read(view.read_be16(4));
  const auto association = context.read(view.read_be16(6));
  const auto data_offset = context.read(view.read_be16(8));
  const auto count = context.read(view.read_be16(10));
  if (!control_flags || !sequence || !status || !association || !data_offset ||
      !count ||
      !context.add_unsigned(state.leap_indicator, parent, view, 0, 1,
                            flags >> 6U) ||
      !context.add_unsigned(state.control_flags, parent, view, 1, 1,
                            *control_flags) ||
      !context.add_unsigned(state.control_response, parent, view, 1, 1,
                            (*control_flags & 0x80U) != 0) ||
      !context.add_unsigned(state.control_error, parent, view, 1, 1,
                            (*control_flags & 0x40U) != 0) ||
      !context.add_unsigned(state.control_more, parent, view, 1, 1,
                            (*control_flags & 0x20U) != 0) ||
      !context.add_unsigned(state.control_opcode, parent, view, 1, 1,
                            *control_flags & 0x1fU) ||
      !context.add_unsigned(state.control_sequence, parent, view, 2, 2,
                            *sequence) ||
      !context.add_unsigned(state.control_status, parent, view, 4, 2,
                            *status) ||
      !context.add_unsigned(state.control_association_id, parent, view, 6, 2,
                            *association) ||
      !context.add_unsigned(state.control_offset, parent, view, 8, 2,
                            *data_offset) ||
      !context.add_unsigned(state.control_count, parent, view, 10, 2, *count)) {
    return false;
  }
  const auto data_length = static_cast<std::size_t>(*count);
  if (data_length > view.reported_length() - 12) {
    context.mark_malformed();
    return false;
  }
  if (data_length != 0) {
    const auto data = context.read(view.read_bytes(12, data_length));
    if (!data ||
        !context.add_bytes(state.control_data, parent, view, 12, *data)) {
      return false;
    }
  }
  const auto data_end = std::size_t{12} + data_length;
  const auto padded_end = (data_end + 3U) & ~std::size_t{3};
  if (padded_end > view.reported_length()) {
    context.mark_malformed();
    return false;
  }
  if (padded_end > data_end) {
    const auto padding =
        context.read(view.read_bytes(data_end, padded_end - data_end));
    if (!padding || !add_trailing(context, state, view, parent, data_end,
                                  padded_end - data_end)) {
      return false;
    }
    if (std::any_of(padding->begin(), padding->end(),
                    [](std::byte value) { return value != std::byte{0}; })) {
      context.mark_malformed();
    }
  }
  return parse_authentication(context, state, view, parent, padded_end);
}

bool parse_private(DissectorContext &context, const NtpDissectorState &state,
                   const PacketView &view, std::uint32_t parent,
                   std::uint8_t flags) {
  if (view.reported_length() < 8) {
    context.mark_malformed();
    return false;
  }
  const auto auth_sequence = context.read(view.read_u8(1));
  const auto implementation = context.read(view.read_u8(2));
  const auto request_code = context.read(view.read_u8(3));
  const auto count_word = context.read(view.read_be16(4));
  const auto size_word = context.read(view.read_be16(6));
  if (!auth_sequence || !implementation || !request_code || !count_word ||
      !size_word ||
      !context.add_unsigned(state.private_flags, parent, view, 0, 1, flags) ||
      !context.add_unsigned(state.private_response, parent, view, 0, 1,
                            (flags & 0x80U) != 0) ||
      !context.add_unsigned(state.private_more, parent, view, 0, 1,
                            (flags & 0x40U) != 0) ||
      !context.add_unsigned(state.private_auth, parent, view, 1, 1,
                            (*auth_sequence & 0x80U) != 0) ||
      !context.add_unsigned(state.private_sequence, parent, view, 1, 1,
                            *auth_sequence & 0x7fU) ||
      !context.add_unsigned(state.private_implementation, parent, view, 2, 1,
                            *implementation) ||
      !context.add_unsigned(state.private_request_code, parent, view, 3, 1,
                            *request_code) ||
      !context.add_unsigned(state.private_error_code, parent, view, 4, 2,
                            *count_word >> 12U) ||
      !context.add_unsigned(state.private_item_count, parent, view, 4, 2,
                            *count_word & 0x0fffU) ||
      !context.add_unsigned(state.private_item_size, parent, view, 6, 2,
                            *size_word & 0x0fffU)) {
    return false;
  }
  if ((*size_word & 0xf000U) != 0) {
    context.mark_malformed();
  }
  const auto item_count = static_cast<std::size_t>(*count_word & 0x0fffU);
  const auto item_size = static_cast<std::size_t>(*size_word & 0x0fffU);
  if (item_count != 0 && item_size == 0) {
    context.mark_malformed();
    return false;
  }
  const auto data_length = item_count * item_size;
  if (data_length > view.reported_length() - 8) {
    context.mark_malformed();
    return false;
  }
  if (data_length != 0) {
    const auto data = context.read(view.read_bytes(8, data_length));
    if (!data ||
        !context.add_bytes(state.private_data, parent, view, 8, *data)) {
      return false;
    }
  }
  return add_trailing(context, state, view, parent, 8 + data_length,
                      view.reported_length() - 8 - data_length);
}

} // namespace

DissectionResult dissect_ntp(DissectorContext &context, const void *opaque,
                             const PacketView &view, std::uint32_t parent) {
  const auto &state = *static_cast<const NtpDissectorState *>(opaque);
  const auto message =
      context.add_protocol(state.message, parent, view, view.captured_length());
  if (!message || context.stopped()) {
    return {};
  }
  if (view.reported_length() < 1) {
    context.mark_malformed();
    return {};
  }
  const auto flags = context.read(view.read_u8(0));
  if (!flags ||
      !context.add_unsigned(state.flags, *message, view, 0, 1, *flags) ||
      !context.add_unsigned(state.version, *message, view, 0, 1,
                            (*flags >> 3U) & 0x07U) ||
      !context.add_unsigned(state.mode, *message, view, 0, 1, *flags & 0x07U)) {
    return {};
  }
  const auto mode = *flags & 0x07U;
  if (mode == 6) {
    (void)parse_control(context, state, view, *message, *flags);
  } else if (mode == 7) {
    (void)parse_private(context, state, view, *message, *flags);
  } else {
    (void)parse_standard(context, state, view, *message, *flags);
  }
  return {view.reported_length()};
}

} // namespace pruftnet::parsing::internal

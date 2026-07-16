#include "parsing/dissectors/dhcp_dissector.hpp"

#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <optional>
#include <span>

#include "parsing/dissector_context.hpp"
#include "parsing/dissectors/dissector_states.hpp"
#include "parsing/dissectors/shared/dissector_utils.hpp"

namespace pruftnet::parsing::internal {
namespace {

constexpr std::size_t kFixedHeaderLength = 236;
constexpr std::size_t kCookieOffset = 236;
constexpr std::size_t kOptionsOffset = 240;
constexpr std::uint32_t kDhcpMagicCookie = 0x63825363;

bool add_available(DissectorContext &context, FieldId field,
                   std::uint32_t parent, const PacketView &view,
                   std::size_t offset, std::size_t end) {
  if (offset >= end || offset >= view.captured_length()) {
    return true;
  }
  const auto length = std::min(end, view.captured_length()) - offset;
  return context.add_bytes(field, parent, view, offset,
                           view.captured().subspan(offset, length));
}

bool add_fixed_string(DissectorContext &context, FieldId field,
                      std::uint32_t parent, const PacketView &view,
                      std::size_t offset, std::size_t length) {
  const auto bytes = context.read(view.read_bytes(offset, length));
  if (!bytes) {
    return false;
  }
  const auto terminator = std::find(bytes->begin(), bytes->end(), std::byte{0});
  const auto text_length =
      static_cast<std::size_t>(terminator - bytes->begin());
  if (text_length == 0) {
    return true;
  }
  return context.add_string(field, parent, view, offset, text_length,
                            escaped_ascii(bytes->first(text_length)));
}

bool add_ipv4_list(DissectorContext &context, FieldId field,
                   std::uint32_t parent, const PacketView &data) {
  if (data.reported_length() == 0 || data.reported_length() % 4 != 0) {
    context.mark_malformed();
    return false;
  }
  for (std::size_t offset = 0; offset < data.reported_length(); offset += 4) {
    if (!context.consume_dissector_call()) {
      return false;
    }
    const auto address = context.read(data.read_bytes(offset, 4));
    if (!address || !context.add_bytes(field, parent, data, offset, *address)) {
      return false;
    }
  }
  return true;
}

bool parse_relay_suboptions(DissectorContext &context,
                            const DhcpDissectorState &state,
                            const PacketView &data, std::uint32_t parent) {
  std::size_t offset = 0;
  while (offset < data.reported_length()) {
    if (!context.consume_dissector_call()) {
      return false;
    }
    if (data.reported_length() - offset < 2) {
      context.mark_malformed();
      return false;
    }
    const auto code = context.read(data.read_u8(offset));
    const auto length = context.read(data.read_u8(offset + 1));
    if (!code || !length) {
      return false;
    }
    const auto data_length = static_cast<std::size_t>(*length);
    if (data_length > data.reported_length() - offset - 2) {
      context.mark_malformed();
      return false;
    }
    const auto suboption_result =
        data.subview(offset, 2 + data_length, 2 + data_length);
    if (!suboption_result.has_value()) {
      context.mark_malformed();
      return false;
    }
    const auto &suboption_view = *suboption_result.value();
    const auto suboption =
        context.add_protocol(state.relay_suboption, parent, suboption_view,
                             suboption_view.captured_length());
    if (!suboption ||
        !context.add_unsigned(state.relay_suboption_code, *suboption,
                              suboption_view, 0, 1, *code) ||
        !context.add_unsigned(state.relay_suboption_length, *suboption,
                              suboption_view, 1, 1, *length)) {
      return false;
    }
    if (data_length != 0) {
      const auto value =
          context.read(suboption_view.read_bytes(2, data_length));
      if (!value || !context.add_bytes(state.relay_suboption_data, *suboption,
                                       suboption_view, 2, *value)) {
        return false;
      }
    }
    offset += 2 + data_length;
  }
  return true;
}

bool parse_option_data(DissectorContext &context,
                       const DhcpDissectorState &state, std::uint8_t code,
                       const PacketView &data, std::uint32_t parent,
                       bool overloaded, std::uint8_t &overload) {
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
  const auto exact_address = [&](FieldId field) {
    if (data.reported_length() != 4) {
      context.mark_malformed();
      return false;
    }
    const auto value = context.read(data.read_bytes(0, 4));
    return value && context.add_bytes(field, parent, data, 0, *value);
  };
  const auto text = [&](FieldId field) {
    const auto value = context.read(data.read_bytes(0, data.reported_length()));
    return value &&
           context.add_string(field, parent, data, 0, data.reported_length(),
                              escaped_ascii(*value));
  };

  switch (code) {
  case 1:
    return exact_address(state.subnet_mask);
  case 3:
    return add_ipv4_list(context, state.router, parent, data);
  case 6:
    return add_ipv4_list(context, state.dns_server, parent, data);
  case 12:
    return text(state.host_name);
  case 15:
    return text(state.domain_name);
  case 50:
    return exact_address(state.requested_address);
  case 51:
    return exact_u32(state.lease_time);
  case 52: {
    if (overloaded || !exact_u8(state.overload)) {
      if (overloaded) {
        context.mark_malformed();
      }
      return false;
    }
    const auto value = context.read(data.read_u8(0));
    if (!value) {
      return false;
    }
    if (*value == 0 || *value > 3) {
      context.mark_malformed();
      return false;
    }
    overload = *value;
    return true;
  }
  case 53:
    return exact_u8(state.message_type);
  case 54:
    return exact_address(state.server_identifier);
  case 55:
    for (std::size_t offset = 0; offset < data.reported_length(); ++offset) {
      if (!context.consume_dissector_call()) {
        return false;
      }
      const auto value = context.read(data.read_u8(offset));
      if (!value || !context.add_unsigned(state.parameter_request, parent, data,
                                          offset, 1, *value)) {
        return false;
      }
    }
    return true;
  case 57: {
    if (!exact_u16(state.maximum_message_size)) {
      return false;
    }
    const auto value = context.read(data.read_be16(0));
    if (value && *value < 576) {
      context.mark_malformed();
    }
    return value.has_value();
  }
  case 58:
    return exact_u32(state.renewal_time);
  case 59:
    return exact_u32(state.rebinding_time);
  case 60:
    return text(state.vendor_class);
  case 61: {
    if (data.reported_length() < 2) {
      context.mark_malformed();
      return false;
    }
    const auto value = context.read(data.read_bytes(0, data.reported_length()));
    return value &&
           context.add_bytes(state.client_identifier, parent, data, 0, *value);
  }
  case 82:
    return parse_relay_suboptions(context, state, data, parent);
  default:
    return add_available(context, state.option_data, parent, data, 0,
                         data.reported_length());
  }
}

bool parse_options(DissectorContext &context, const DhcpDissectorState &state,
                   const PacketView &view, std::uint32_t parent,
                   std::size_t start, std::size_t end, bool overloaded,
                   std::uint8_t &overload) {
  std::size_t offset = start;
  while (offset < end) {
    if (!context.consume_dissector_call()) {
      return false;
    }
    const auto code = context.read(view.read_u8(offset));
    if (!code) {
      return false;
    }
    if (*code == 0) {
      const auto padding_start = offset;
      do {
        ++offset;
        if (offset == end) {
          break;
        }
        const auto next = context.read(view.read_u8(offset));
        if (!next) {
          return false;
        }
        if (*next != 0) {
          break;
        }
      } while (true);
      if (!add_available(context, state.padding, parent, view, padding_start,
                         offset)) {
        return false;
      }
      continue;
    }
    if (*code == 255) {
      if (!context.add_unsigned(state.end, parent, view, offset, 1, *code)) {
        return false;
      }
      ++offset;
      if (offset < end) {
        const auto remaining =
            context.read(view.read_bytes(offset, end - offset));
        if (!remaining) {
          return false;
        }
        const auto first_nonzero =
            std::find_if(remaining->begin(), remaining->end(),
                         [](std::byte value) { return value != std::byte{0}; });
        if (first_nonzero == remaining->end()) {
          return context.add_bytes(state.padding, parent, view, offset,
                                   *remaining);
        }
        context.mark_malformed();
        return context.add_bytes(state.trailing, parent, view, offset,
                                 *remaining);
      }
      return true;
    }
    if (end - offset < 2) {
      context.mark_malformed();
      return false;
    }
    const auto length = context.read(view.read_u8(offset + 1));
    if (!length) {
      return false;
    }
    const auto data_length = static_cast<std::size_t>(*length);
    if (data_length > end - offset - 2) {
      context.mark_malformed();
      return false;
    }
    const auto option_result =
        view.subview(offset, 2 + data_length, 2 + data_length);
    if (!option_result.has_value()) {
      context.mark_malformed();
      return false;
    }
    const auto &option_view = *option_result.value();
    const auto option = context.add_protocol(state.option, parent, option_view,
                                             option_view.captured_length());
    if (!option ||
        !context.add_unsigned(state.option_code, *option, option_view, 0, 1,
                              *code) ||
        !context.add_unsigned(state.option_length, *option, option_view, 1, 1,
                              *length)) {
      return false;
    }
    const auto data_result = option_view.subview(2, data_length, data_length);
    if (!data_result.has_value()) {
      context.mark_malformed();
      return false;
    }
    const auto &data = *data_result.value();
    if (data.captured_length() < data.reported_length()) {
      context.mark_partial();
    }
    if (!parse_option_data(context, state, *code, data, *option, overloaded,
                           overload)) {
      if (!context.stopped() &&
          !add_available(context, state.option_data, *option, data, 0,
                         data.reported_length())) {
        return false;
      }
      return false;
    }
    offset += 2 + data_length;
  }
  context.mark_malformed();
  return false;
}

} // namespace

DissectionResult dissect_dhcp(DissectorContext &context, const void *opaque,
                              const PacketView &view, std::uint32_t parent) {
  const auto &state = *static_cast<const DhcpDissectorState *>(opaque);
  const auto message =
      context.add_protocol(state.message, parent, view, view.captured_length());
  if (!message || context.stopped()) {
    return {};
  }
  if (view.reported_length() < kFixedHeaderLength) {
    context.mark_malformed();
    (void)add_available(context, state.trailing, *message, view, 0,
                        view.reported_length());
    return {};
  }

  const auto operation = context.read(view.read_u8(0));
  const auto hardware_type = context.read(view.read_u8(1));
  const auto hardware_length = context.read(view.read_u8(2));
  const auto hops = context.read(view.read_u8(3));
  const auto transaction_id = context.read(view.read_be32(4));
  const auto seconds = context.read(view.read_be16(8));
  const auto flags = context.read(view.read_be16(10));
  const auto client_address = context.read(view.read_bytes(12, 4));
  const auto your_address = context.read(view.read_bytes(16, 4));
  const auto server_address = context.read(view.read_bytes(20, 4));
  const auto relay_address = context.read(view.read_bytes(24, 4));
  if (!operation || !hardware_type || !hardware_length || !hops ||
      !transaction_id || !seconds || !flags || !client_address ||
      !your_address || !server_address || !relay_address) {
    return {};
  }
  if (*operation < 1 || *operation > 2 || *hardware_length > 16 ||
      (*flags & 0x7fffU) != 0) {
    context.mark_malformed();
  }
  const auto address_length = std::min<std::size_t>(*hardware_length, 16);
  const auto hardware_address =
      context.read(view.read_bytes(28, address_length));
  const auto hardware_padding =
      context.read(view.read_bytes(28 + address_length, 16 - address_length));
  if (!hardware_address || !hardware_padding ||
      !context.add_unsigned(state.operation, *message, view, 0, 1,
                            *operation) ||
      !context.add_unsigned(state.hardware_type, *message, view, 1, 1,
                            *hardware_type) ||
      !context.add_unsigned(state.hardware_length, *message, view, 2, 1,
                            *hardware_length) ||
      !context.add_unsigned(state.hops, *message, view, 3, 1, *hops) ||
      !context.add_unsigned(state.transaction_id, *message, view, 4, 4,
                            *transaction_id) ||
      !context.add_unsigned(state.seconds, *message, view, 8, 2, *seconds) ||
      !context.add_unsigned(state.flags, *message, view, 10, 2, *flags) ||
      !context.add_unsigned(state.broadcast, *message, view, 10, 2,
                            (*flags & 0x8000U) != 0) ||
      !context.add_bytes(state.client_address, *message, view, 12,
                         *client_address) ||
      !context.add_bytes(state.your_address, *message, view, 16,
                         *your_address) ||
      !context.add_bytes(state.server_address, *message, view, 20,
                         *server_address) ||
      !context.add_bytes(state.relay_address, *message, view, 24,
                         *relay_address) ||
      (address_length != 0 &&
       !context.add_bytes(state.client_hardware_address, *message, view, 28,
                          *hardware_address)) ||
      (address_length != 16 &&
       !context.add_bytes(state.client_hardware_padding, *message, view,
                          28 + address_length, *hardware_padding))) {
    return {};
  }

  if (view.reported_length() < kOptionsOffset) {
    if (!add_fixed_string(context, state.server_name, *message, view, 44, 64) ||
        !add_fixed_string(context, state.boot_file, *message, view, 108, 128) ||
        !add_available(context, state.trailing, *message, view,
                       kFixedHeaderLength, view.reported_length())) {
      return {};
    }
    return {view.reported_length()};
  }

  const auto cookie = context.read(view.read_be32(kCookieOffset));
  if (!cookie) {
    return {};
  }
  if (*cookie != kDhcpMagicCookie) {
    if (!add_fixed_string(context, state.server_name, *message, view, 44, 64) ||
        !add_fixed_string(context, state.boot_file, *message, view, 108, 128) ||
        !add_available(context, state.trailing, *message, view, kCookieOffset,
                       view.reported_length())) {
      return {};
    }
    return {view.reported_length()};
  }
  if (!context.add_unsigned(state.magic_cookie, *message, view, kCookieOffset,
                            4, *cookie)) {
    return {};
  }

  std::uint8_t overload = 0;
  if (!parse_options(context, state, view, *message, kOptionsOffset,
                     view.reported_length(), false, overload)) {
    return {view.reported_length()};
  }
  if ((overload & 2U) != 0) {
    if (!parse_options(context, state, view, *message, 44, 108, true,
                       overload)) {
      return {view.reported_length()};
    }
  } else if (!add_fixed_string(context, state.server_name, *message, view, 44,
                               64)) {
    return {};
  }
  if ((overload & 1U) != 0) {
    if (!parse_options(context, state, view, *message, 108, 236, true,
                       overload)) {
      return {view.reported_length()};
    }
  } else if (!add_fixed_string(context, state.boot_file, *message, view, 108,
                               128)) {
    return {};
  }
  return {view.reported_length()};
}

} // namespace pruftnet::parsing::internal

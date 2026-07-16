#include "parsing/dissectors/link/lldp_dissector.hpp"

#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <string_view>

#include "parsing/dissector_context.hpp"
#include "parsing/utf8.hpp"

namespace pruftnet::parsing::internal {
namespace {

constexpr std::uint8_t kEndType = 0;
constexpr std::uint8_t kChassisIdType = 1;
constexpr std::uint8_t kPortIdType = 2;
constexpr std::uint8_t kTimeToLiveType = 3;
constexpr std::uint8_t kPortDescriptionType = 4;
constexpr std::uint8_t kSystemNameType = 5;
constexpr std::uint8_t kSystemDescriptionType = 6;
constexpr std::uint8_t kSystemCapabilitiesType = 7;
constexpr std::uint8_t kManagementAddressType = 8;
constexpr std::uint8_t kOrganizationSpecificType = 127;

std::string_view as_string(std::span<const std::byte> bytes) noexcept {
  return {reinterpret_cast<const char *>(bytes.data()), bytes.size()};
}

bool add_text(DissectorContext &context, FieldId field, FieldId fallback,
              std::uint32_t parent, const PacketView &tlv, std::size_t offset,
              std::size_t length) {
  const auto bytes = context.read(tlv.read_bytes(offset, length));
  if (!bytes) {
    return false;
  }
  const auto text = as_string(*bytes);
  if (!is_valid_utf8(text)) {
    context.mark_malformed();
    return context.add_bytes(fallback, parent, tlv, offset, *bytes);
  }
  return context.add_string(field, parent, tlv, offset, length, text);
}

bool dissect_identifier(DissectorContext &context,
                        const LldpDissectorState &state, const PacketView &tlv,
                        std::uint32_t parent, std::uint8_t type,
                        std::size_t length) {
  if (length < 2 || length > 256) {
    context.mark_malformed();
    return context.add_unknown(parent, tlv, 2, length);
  }
  const auto subtype = context.read(tlv.read_u8(2));
  if (!subtype) {
    return false;
  }
  const auto subtype_field =
      type == kChassisIdType ? state.chassis_subtype : state.port_subtype;
  const auto identifier_field =
      type == kChassisIdType ? state.chassis_id : state.port_id;
  if (!context.add_unsigned(subtype_field, parent, tlv, 2, 1, *subtype)) {
    return false;
  }

  const bool mac_address = (type == kChassisIdType && *subtype == 4) ||
                           (type == kPortIdType && *subtype == 3);
  const bool network_address = (type == kChassisIdType && *subtype == 5) ||
                               (type == kPortIdType && *subtype == 4);
  if (mac_address && length != 7) {
    context.mark_malformed();
  }
  if (network_address) {
    if (length < 3) {
      context.mark_malformed();
      return context.add_unknown(parent, tlv, 3, length - 1);
    }
    const auto family = context.read(tlv.read_u8(3));
    if (!family || !context.add_unsigned(state.address_family, parent, tlv, 3,
                                         1, *family)) {
      return false;
    }
    if ((*family == 1 && length != 6) || (*family == 2 && length != 18)) {
      context.mark_malformed();
    }
  }

  const auto identifier = context.read(tlv.read_bytes(3, length - 1));
  return identifier &&
         context.add_bytes(identifier_field, parent, tlv, 3, *identifier);
}

bool dissect_management_address(DissectorContext &context,
                                const LldpDissectorState &state,
                                const PacketView &tlv, std::uint32_t parent,
                                std::size_t length) {
  if (length < 8) {
    context.mark_malformed();
    return context.add_unknown(parent, tlv, 2, length);
  }
  const auto address_length = context.read(tlv.read_u8(2));
  if (!address_length) {
    return false;
  }
  if (*address_length == 0 ||
      static_cast<std::size_t>(*address_length) + 7 > length) {
    context.mark_malformed();
    return context.add_unknown(parent, tlv, 2, length);
  }
  const auto address_subtype = context.read(tlv.read_u8(3));
  const auto address = context.read(tlv.read_bytes(4, *address_length - 1));
  const auto interface_offset = 3 + static_cast<std::size_t>(*address_length);
  const auto interface_subtype = context.read(tlv.read_u8(interface_offset));
  const auto interface_number =
      context.read(tlv.read_be32(interface_offset + 1));
  const auto oid_length = context.read(tlv.read_u8(interface_offset + 5));
  if (!address_subtype || !address || !interface_subtype || !interface_number ||
      !oid_length) {
    return false;
  }
  const auto expected_length =
      static_cast<std::size_t>(*address_length) + 7 + *oid_length;
  if (expected_length != length) {
    context.mark_malformed();
    if (expected_length > length) {
      return context.add_unknown(parent, tlv, 2, length);
    }
  }
  const auto available_oid =
      std::min<std::size_t>(*oid_length, length - (interface_offset + 6 - 2));
  const auto oid =
      context.read(tlv.read_bytes(interface_offset + 6, available_oid));
  if (!oid ||
      !context.add_unsigned(state.management_address_length, parent, tlv, 2, 1,
                            *address_length) ||
      !context.add_unsigned(state.management_address_subtype, parent, tlv, 3, 1,
                            *address_subtype) ||
      !context.add_bytes(state.management_address, parent, tlv, 4, *address) ||
      !context.add_unsigned(state.management_interface_subtype, parent, tlv,
                            interface_offset, 1, *interface_subtype) ||
      !context.add_unsigned(state.management_interface_number, parent, tlv,
                            interface_offset + 1, 4, *interface_number)) {
    return false;
  }
  return available_oid == 0 ||
         context.add_bytes(state.management_oid, parent, tlv,
                           interface_offset + 6, *oid);
}

bool dissect_tlv_body(DissectorContext &context,
                      const LldpDissectorState &state, const PacketView &tlv,
                      std::uint32_t parent, std::uint8_t type,
                      std::size_t length) {
  switch (type) {
  case kEndType:
    if (length != 0) {
      context.mark_malformed();
      return context.add_unknown(parent, tlv, 2, length);
    }
    return true;
  case kChassisIdType:
  case kPortIdType:
    return dissect_identifier(context, state, tlv, parent, type, length);
  case kTimeToLiveType: {
    if (length != 2) {
      context.mark_malformed();
      return context.add_unknown(parent, tlv, 2, length);
    }
    const auto ttl = context.read(tlv.read_be16(2));
    return ttl &&
           context.add_unsigned(state.ttl, parent, tlv, 2, 2, *ttl).has_value();
  }
  case kPortDescriptionType:
    return add_text(context, state.port_description, state.tlv_value, parent,
                    tlv, 2, length);
  case kSystemNameType:
    return add_text(context, state.system_name, state.tlv_value, parent, tlv, 2,
                    length);
  case kSystemDescriptionType:
    return add_text(context, state.system_description, state.tlv_value, parent,
                    tlv, 2, length);
  case kSystemCapabilitiesType: {
    if (length != 4) {
      context.mark_malformed();
      return context.add_unknown(parent, tlv, 2, length);
    }
    const auto capabilities = context.read(tlv.read_be16(2));
    const auto enabled = context.read(tlv.read_be16(4));
    return capabilities && enabled &&
           context
               .add_unsigned(state.system_capabilities, parent, tlv, 2, 2,
                             *capabilities)
               .has_value() &&
           context
               .add_unsigned(state.enabled_capabilities, parent, tlv, 4, 2,
                             *enabled)
               .has_value();
  }
  case kManagementAddressType:
    return dissect_management_address(context, state, tlv, parent, length);
  case kOrganizationSpecificType: {
    if (length < 4) {
      context.mark_malformed();
      return context.add_unknown(parent, tlv, 2, length);
    }
    const auto oui_bytes = context.read(tlv.read_bytes(2, 3));
    const auto subtype = context.read(tlv.read_u8(5));
    if (!oui_bytes || !subtype) {
      return false;
    }
    const auto oui = (static_cast<std::uint32_t>(
                          std::to_integer<std::uint8_t>((*oui_bytes)[0]))
                      << 16U) |
                     (static_cast<std::uint32_t>(
                          std::to_integer<std::uint8_t>((*oui_bytes)[1]))
                      << 8U) |
                     static_cast<std::uint32_t>(
                         std::to_integer<std::uint8_t>((*oui_bytes)[2]));
    if (!context.add_unsigned(state.organization_oui, parent, tlv, 2, 3, oui) ||
        !context.add_unsigned(state.organization_subtype, parent, tlv, 5, 1,
                              *subtype)) {
      return false;
    }
    const auto data_length = length - 4;
    if (data_length == 0) {
      return true;
    }
    const auto data = context.read(tlv.read_bytes(6, data_length));
    return data &&
           context.add_bytes(state.organization_data, parent, tlv, 6, *data);
  }
  default: {
    const auto value = context.read(tlv.read_bytes(2, length));
    return value && context.add_bytes(state.tlv_value, parent, tlv, 2, *value);
  }
  }
}

} // namespace

DissectionResult dissect_lldp(DissectorContext &context, const void *opaque,
                              const PacketView &view, std::uint32_t parent) {
  const auto &state = *static_cast<const LldpDissectorState *>(opaque);
  const auto packet =
      context.add_protocol(state.packet, parent, view, view.captured_length());
  if (!packet || context.stopped()) {
    return {};
  }

  std::size_t offset = 0;
  std::size_t index = 0;
  bool seen_chassis = false;
  bool seen_port = false;
  bool seen_ttl = false;
  bool shutdown = false;
  while (offset < view.reported_length()) {
    if (view.reported_length() - offset < 2) {
      context.mark_malformed();
      (void)context.add_unknown(*packet, view, offset,
                                view.reported_length() - offset);
      return {view.reported_length()};
    }
    const auto header = context.read(view.read_be16(offset));
    if (!header) {
      return {offset};
    }
    const auto type = static_cast<std::uint8_t>(*header >> 9U);
    const auto length = static_cast<std::size_t>(*header & 0x01ffU);
    const auto total_length = 2 + length;
    if (total_length > view.reported_length() - offset) {
      context.mark_malformed();
      (void)context.add_unknown(*packet, view, offset,
                                view.reported_length() - offset);
      return {view.reported_length()};
    }
    const auto tlv_result = view.subview(offset, total_length, total_length);
    if (!tlv_result.has_value()) {
      context.mark_malformed();
      return {offset};
    }
    const auto &tlv = *tlv_result.value();
    const auto tlv_node =
        context.add_protocol(state.tlv, *packet, tlv, tlv.captured_length());
    if (!tlv_node ||
        !context.add_unsigned(state.tlv_type, *tlv_node, tlv, 0, 2, type) ||
        !context.add_unsigned(state.tlv_length, *tlv_node, tlv, 0, 2, length)) {
      return {};
    }

    const auto expected_type = index == 0   ? kChassisIdType
                               : index == 1 ? kPortIdType
                               : index == 2 ? kTimeToLiveType
                                            : type;
    if (type != expected_type) {
      context.mark_malformed();
    }
    if ((type == kChassisIdType && seen_chassis) ||
        (type == kPortIdType && seen_port) ||
        (type == kTimeToLiveType && seen_ttl) ||
        (shutdown && index >= 3 && type != kEndType)) {
      context.mark_malformed();
    }
    seen_chassis = seen_chassis || type == kChassisIdType;
    seen_port = seen_port || type == kPortIdType;
    seen_ttl = seen_ttl || type == kTimeToLiveType;
    if (!dissect_tlv_body(context, state, tlv, *tlv_node, type, length)) {
      return {};
    }
    if (type == kTimeToLiveType && length == 2) {
      const auto ttl = context.read(tlv.read_be16(2));
      shutdown = ttl && *ttl == 0;
    }

    offset += total_length;
    ++index;
    if (type == kEndType) {
      if (!seen_chassis || !seen_port || !seen_ttl) {
        context.mark_malformed();
      }
      return {offset};
    }
  }
  if (!seen_chassis || !seen_port || !seen_ttl) {
    context.mark_malformed();
  }
  return {view.reported_length()};
}

} // namespace pruftnet::parsing::internal

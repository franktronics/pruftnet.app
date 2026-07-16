#include "parsing/dissectors/network/icmp_extension.hpp"

#include <algorithm>
#include <span>

#include "parsing/dissector_context.hpp"

namespace pruftnet::parsing::internal {
namespace {

bool checksum_valid(std::span<const std::byte> bytes) noexcept {
  std::uint32_t sum = 0;
  std::size_t offset = 0;
  while (offset + 1 < bytes.size()) {
    sum += (static_cast<std::uint32_t>(
                std::to_integer<std::uint8_t>(bytes[offset]))
            << 8U) |
           std::to_integer<std::uint8_t>(bytes[offset + 1]);
    offset += 2;
  }
  if (offset < bytes.size()) {
    sum +=
        static_cast<std::uint32_t>(std::to_integer<std::uint8_t>(bytes[offset]))
        << 8U;
  }
  while ((sum >> 16U) != 0) {
    sum = (sum & 0xffffU) + (sum >> 16U);
  }
  return sum == 0xffffU;
}

bool add_payload(DissectorContext &context, FieldId field, std::uint32_t parent,
                 const PacketView &view, std::size_t offset) {
  const auto logical =
      view.reported_length() > offset ? view.reported_length() - offset : 0;
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

bool parse_mpls_stack(DissectorContext &context,
                      const IcmpExtensionDissectorState &state,
                      const PacketView &object_view, std::uint32_t parent) {
  if (object_view.reported_length() < 8) {
    context.mark_malformed();
    return false;
  }
  for (std::size_t offset = 4; offset < object_view.reported_length();
       offset += 4) {
    if (!context.consume_dissector_call()) {
      return false;
    }
    const auto entry_view_result = object_view.subview(offset, 4, 4);
    if (!entry_view_result.has_value()) {
      context.mark_malformed();
      return false;
    }
    const auto &entry_view = *entry_view_result.value();
    const auto value = context.read(entry_view.read_be32(0));
    if (!value) {
      return false;
    }
    const auto entry = context.add_protocol(
        state.mpls_entry, parent, entry_view, entry_view.captured_length());
    if (!entry ||
        !context.add_unsigned(state.mpls_label, *entry, entry_view, 0, 4,
                              *value >> 12U) ||
        !context.add_unsigned(state.mpls_traffic_class, *entry, entry_view, 0,
                              4, (*value >> 9U) & 0x7U) ||
        !context.add_unsigned(state.mpls_bottom_of_stack, *entry, entry_view, 0,
                              4, (*value >> 8U) & 0x1U) ||
        !context.add_unsigned(state.mpls_ttl, *entry, entry_view, 0, 4,
                              *value & 0xffU)) {
      return false;
    }
  }
  return true;
}

bool validate_interface_identification(DissectorContext &context,
                                       const PacketView &object_view,
                                       std::uint8_t ctype) {
  if (ctype == 2 && object_view.reported_length() != 8) {
    context.mark_malformed();
    return false;
  }
  if (ctype != 3) {
    return true;
  }
  if (object_view.reported_length() < 8) {
    context.mark_malformed();
    return false;
  }
  const auto address_length = context.read(object_view.read_u8(6));
  const auto reserved = context.read(object_view.read_u8(7));
  if (!address_length || !reserved) {
    return false;
  }
  if (*reserved != 0 || *address_length > object_view.reported_length() - 8) {
    context.mark_malformed();
    return false;
  }
  return true;
}

} // namespace

IcmpExtensionSummary
dissect_icmp_extension(DissectorContext &context,
                       const IcmpExtensionDissectorState &state,
                       const PacketView &view, std::uint32_t parent) {
  IcmpExtensionSummary summary;
  if (view.captured_length() == 0 && view.reported_length() != 0) {
    context.mark_partial();
    return summary;
  }
  const auto structure = context.add_protocol(state.structure, parent, view,
                                              view.captured_length());
  if (!structure || context.stopped()) {
    return summary;
  }
  if (view.reported_length() < 4) {
    context.mark_malformed();
    return summary;
  }
  const auto version_reserved = context.read(view.read_be16(0));
  const auto checksum = context.read(view.read_be16(2));
  if (!version_reserved || !checksum) {
    return summary;
  }
  const auto version = static_cast<std::uint8_t>(*version_reserved >> 12U);
  const auto reserved = static_cast<std::uint16_t>(*version_reserved & 0x0fffU);
  if (!context.add_unsigned(state.version, *structure, view, 0, 1, version) ||
      !context.add_unsigned(state.reserved, *structure, view, 0, 2, reserved) ||
      !context.add_unsigned(state.checksum, *structure, view, 2, 2,
                            *checksum)) {
    return summary;
  }
  if (version != 1 && version != 2) {
    context.mark_malformed();
    return summary;
  }
  if (reserved != 0) {
    context.mark_malformed();
  }
  if (*checksum != 0 && view.captured_length() >= view.reported_length()) {
    const bool valid =
        checksum_valid(view.captured().first(view.reported_length()));
    if (!context.add_unsigned(state.checksum_valid, *structure, view, 2, 0,
                              valid, ParsedNodeFlagGenerated)) {
      return summary;
    }
    if (!valid) {
      context.mark_malformed();
    }
  }

  std::size_t offset = 4;
  while (offset < view.reported_length()) {
    if (!context.consume_dissector_call()) {
      return summary;
    }
    if (view.reported_length() - offset < 4) {
      context.mark_malformed();
      return summary;
    }
    const auto length = context.read(view.read_be16(offset));
    const auto object_class = context.read(view.read_u8(offset + 2));
    const auto ctype = context.read(view.read_u8(offset + 3));
    if (!length || !object_class || !ctype) {
      return summary;
    }
    if (*length < 4 || (*length % 4) != 0 ||
        *length > view.reported_length() - offset) {
      context.mark_malformed();
      return summary;
    }
    const auto subview_result = view.subview(offset, *length, *length);
    if (!subview_result.has_value()) {
      context.mark_malformed();
      return summary;
    }
    const auto &object_view = *subview_result.value();
    const auto object = context.add_protocol(
        state.object, *structure, object_view, object_view.captured_length());
    if (!object ||
        !context.add_unsigned(state.object_length, *object, object_view, 0, 2,
                              *length) ||
        !context.add_unsigned(state.object_class, *object, object_view, 2, 1,
                              *object_class) ||
        !context.add_unsigned(state.object_ctype, *object, object_view, 3, 1,
                              *ctype)) {
      return summary;
    }
    ++summary.object_count;
    if (*object_class == 3) {
      ++summary.interface_identification_objects;
      if (!validate_interface_identification(context, object_view, *ctype) ||
          !add_payload(context, state.object_data, *object, object_view, 4)) {
        return summary;
      }
    } else if (*object_class == 1 && *ctype == 1) {
      if (!parse_mpls_stack(context, state, object_view, *object)) {
        return summary;
      }
    } else if (!add_payload(context, state.object_data, *object, object_view,
                            4)) {
      return summary;
    }
    offset += *length;
  }
  if (summary.object_count == 0) {
    context.mark_malformed();
    return summary;
  }
  summary.complete = true;
  return summary;
}

} // namespace pruftnet::parsing::internal

#include "parsing/dissectors/link/ethernet_payload.hpp"

#include <algorithm>
#include <cstddef>

#include "parsing/dissector_context.hpp"
#include "pruftnet/parsing/packet_view.hpp"

namespace pruftnet::parsing::internal {
namespace {

constexpr std::uint16_t kMaximumIeee8023Length = 1500;
constexpr std::uint16_t kMinimumEthernetIiType = 1536;

bool add_trailer(DissectorContext &context, FieldId field, std::uint32_t parent,
                 const PacketView &payload, std::size_t offset,
                 std::size_t logical_length) {
  if (logical_length == 0 || offset >= payload.captured_length()) {
    return true;
  }
  const auto captured_length =
      std::min(logical_length, payload.captured_length() - offset);
  return context.add_bytes(field, parent, payload, offset,
                           payload.captured().subspan(offset, captured_length));
}

bool add_dispatched_remainder(DissectorContext &context, std::uint32_t parent,
                              const PacketView &payload, DissectionResult child,
                              FieldId trailer_field) {
  if (child.consumed_length > payload.reported_length()) {
    context.mark_malformed();
    return true;
  }
  if (child.consumed_length == payload.reported_length()) {
    return true;
  }
  const auto remaining = payload.reported_length() - child.consumed_length;
  if (child.consumed_length == 0) {
    return context.add_unknown(parent, payload, 0, payload.reported_length());
  }
  return add_trailer(context, trailer_field, parent, payload,
                     child.consumed_length, remaining);
}

} // namespace

bool dissect_ethernet_payload(DissectorContext &context,
                              std::uint16_t type_or_length,
                              const PacketView &payload, std::uint32_t parent,
                              FieldId trailer_field) {
  if (type_or_length > kMaximumIeee8023Length &&
      type_or_length < kMinimumEthernetIiType) {
    context.mark_malformed();
    return context.add_unknown(parent, payload, 0, payload.reported_length());
  }

  if (type_or_length == 0 || type_or_length >= kMinimumEthernetIiType) {
    const auto child =
        context.dispatch_ethertype(type_or_length, payload, parent);
    return !context.stopped() &&
           add_dispatched_remainder(context, parent, payload, child,
                                    trailer_field);
  }

  const auto declared_length = static_cast<std::size_t>(type_or_length);
  if (declared_length > payload.reported_length()) {
    context.mark_malformed();
    return context.add_unknown(parent, payload, 0, payload.reported_length());
  }

  const auto content_result =
      payload.subview(0, declared_length, declared_length);
  if (!content_result.has_value()) {
    context.mark_malformed();
    return false;
  }
  const auto &content = *content_result.value();
  bool content_added = false;
  if (declared_length >= 2 && content.captured_length() >= 2 &&
      content.captured()[0] == std::byte{0xff} &&
      content.captured()[1] == std::byte{0xff}) {
    content_added = context.add_unknown(parent, content, 0, declared_length);
  } else {
    const auto child = context.dispatch_llc(content, parent);
    content_added =
        !context.stopped() &&
        (child.consumed_length == declared_length ||
         (child.consumed_length == 0 &&
          context.add_unknown(parent, content, 0, declared_length)));
    if (child.consumed_length > declared_length) {
      context.mark_malformed();
      content_added = true;
    } else if (child.consumed_length != 0 &&
               child.consumed_length < declared_length) {
      content_added =
          context.add_unknown(parent, content, child.consumed_length,
                              declared_length - child.consumed_length);
    }
  }
  if (!content_added) {
    return false;
  }

  return add_trailer(context, trailer_field, parent, payload, declared_length,
                     payload.reported_length() - declared_length);
}

} // namespace pruftnet::parsing::internal

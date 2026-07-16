#include "parsing/dissectors/link/ethernet_dissector.hpp"

#include "parsing/dissector_context.hpp"
#include "parsing/dissectors/link/ethernet_payload.hpp"

namespace pruftnet::parsing::internal {
namespace {
constexpr std::size_t kHeaderLength = 14;
}

DissectionResult dissect_ethernet(DissectorContext &context, const void *opaque,
                                  const PacketView &view,
                                  std::uint32_t parent) {
  const auto &state = *static_cast<const EthernetDissectorState *>(opaque);
  const auto ethernet_node =
      context.add_protocol(state.frame, parent, view, view.captured_length());
  if (!ethernet_node || context.stopped()) {
    return {};
  }
  const auto destination = context.read(view.read_bytes(0, 6));
  const auto source = context.read(view.read_bytes(6, 6));
  const auto type = context.read(view.read_be16(12));
  if (!destination || !source || !type) {
    return {};
  }
  if (!context.add_bytes(state.destination, *ethernet_node, view, 0,
                         *destination) ||
      !context.add_bytes(state.source, *ethernet_node, view, 6, *source) ||
      !context.add_unsigned(state.type, *ethernet_node, view, 12, 2, *type)) {
    return {};
  }

  const auto payload_length = view.reported_length() - kHeaderLength;
  const auto payload_result =
      view.subview(kHeaderLength, payload_length, payload_length);
  if (!payload_result.has_value()) {
    context.mark_malformed();
    return {};
  }
  if (!dissect_ethernet_payload(context, *type, *payload_result.value(),
                                *ethernet_node, state.trailer)) {
    return {};
  }
  return {view.reported_length()};
}

} // namespace pruftnet::parsing::internal

#include "parsing/dissectors/transport/udp_dissector.hpp"

#include <algorithm>

#include "parsing/dissector_context.hpp"

namespace pruftnet::parsing::internal {
namespace {
constexpr std::size_t kHeaderLength = 8;
}

DissectionResult dissect_udp(DissectorContext &context, const void *opaque,
                             const PacketView &view, std::uint32_t parent) {
  const auto &state = *static_cast<const UdpDissectorState *>(opaque);
  const auto declared_length = context.read(view.read_be16(4));
  const auto span = declared_length
                        ? std::min(view.captured_length(),
                                   std::max<std::size_t>(*declared_length, 8))
                        : view.captured_length();
  const auto udp_node =
      context.add_protocol(state.datagram, parent, view, span);
  if (!udp_node || !declared_length || context.stopped()) {
    return {};
  }
  const auto source_port = context.read(view.read_be16(0));
  const auto destination_port = context.read(view.read_be16(2));
  const auto checksum = context.read(view.read_be16(6));
  if (!source_port || !destination_port || !checksum) {
    return {};
  }
  if (!context.add_unsigned(state.source_port, *udp_node, view, 0, 2,
                            *source_port) ||
      !context.add_unsigned(state.destination_port, *udp_node, view, 2, 2,
                            *destination_port) ||
      !context.add_unsigned(state.length, *udp_node, view, 4, 2,
                            *declared_length) ||
      !context.add_unsigned(state.checksum, *udp_node, view, 6, 2, *checksum)) {
    return {};
  }
  if (*declared_length < kHeaderLength ||
      *declared_length > view.reported_length()) {
    context.mark_malformed();
    return {};
  }
  const auto payload_length = *declared_length - kHeaderLength;
  const auto payload_result =
      view.subview(kHeaderLength, payload_length, payload_length);
  if (!payload_result.has_value()) {
    context.mark_malformed();
    return {};
  }
  const auto &payload = *payload_result.value();
  if (payload.captured_length() < payload_length) {
    context.mark_partial();
  }
  if (!context.dispatch_udp_port(*source_port, *destination_port, payload,
                                 *udp_node) &&
      !context.add_bytes(state.payload, *udp_node, payload, 0,
                         payload.captured())) {
    return {};
  }
  if (*declared_length < view.reported_length()) {
    (void)context.add_unknown(parent, view, *declared_length,
                              view.reported_length() - *declared_length);
  }
  return {*declared_length};
}

} // namespace pruftnet::parsing::internal

#include "parsing/dissectors/link/snap_dissector.hpp"

#include <cstddef>

#include "parsing/dissector_context.hpp"

namespace pruftnet::parsing::internal {
namespace {

constexpr std::size_t kHeaderLength = 5;
constexpr std::uint32_t kEncapsulatedEthernetOui = 0;

} // namespace

DissectionResult dissect_snap(DissectorContext &context, const void *opaque,
                              const PacketView &view, std::uint32_t parent) {
  const auto &state = *static_cast<const SnapDissectorState *>(opaque);
  const auto snap =
      context.add_protocol(state.packet, parent, view, view.captured_length());
  if (!snap || context.stopped()) {
    return {};
  }

  const auto oui_bytes = context.read(view.read_bytes(0, 3));
  const auto pid = context.read(view.read_be16(3));
  if (!oui_bytes || !pid) {
    return {};
  }
  const auto oui = (static_cast<std::uint32_t>(
                        std::to_integer<std::uint8_t>((*oui_bytes)[0]))
                    << 16U) |
                   (static_cast<std::uint32_t>(
                        std::to_integer<std::uint8_t>((*oui_bytes)[1]))
                    << 8U) |
                   static_cast<std::uint32_t>(
                       std::to_integer<std::uint8_t>((*oui_bytes)[2]));
  if (!context.add_unsigned(state.oui, *snap, view, 0, 3, oui) ||
      !context.add_unsigned(state.pid, *snap, view, 3, 2, *pid)) {
    return {};
  }

  const auto payload_length = view.reported_length() - kHeaderLength;
  const auto payload_result =
      view.subview(kHeaderLength, payload_length, payload_length);
  if (!payload_result.has_value()) {
    context.mark_malformed();
    return {};
  }
  const auto &payload = *payload_result.value();
  DissectionResult child;
  if (!state.information_frame) {
    if (!context.add_unknown(*snap, payload, 0, payload_length)) {
      return {};
    }
    return {view.reported_length()};
  }
  if (oui == kEncapsulatedEthernetOui) {
    child = context.dispatch_ethertype(*pid, payload, *snap);
  } else {
    child = context.dispatch_snap_pid(oui, *pid, payload, *snap);
  }
  if (context.stopped()) {
    return {};
  }
  if (child.consumed_length > payload_length) {
    context.mark_malformed();
  } else if (child.consumed_length < payload_length &&
             !context.add_unknown(*snap, payload, child.consumed_length,
                                  payload_length - child.consumed_length)) {
    return {};
  }
  return {view.reported_length()};
}

} // namespace pruftnet::parsing::internal

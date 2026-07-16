#include "parsing/dissectors/llc_dissector.hpp"

#include <cstddef>

#include "parsing/dissector_context.hpp"
#include "parsing/dissectors/dissector_states.hpp"

namespace pruftnet::parsing::internal {
namespace {

constexpr std::uint8_t kSnapSap = 0xaa;

bool is_information_frame(std::uint16_t control) noexcept {
  return (control & 0x01U) == 0 || control == 0x03U;
}

} // namespace

DissectionResult dissect_llc(DissectorContext &context, const void *opaque,
                             const PacketView &view, std::uint32_t parent) {
  const auto &state = *static_cast<const LlcDissectorState *>(opaque);
  const auto llc =
      context.add_protocol(state.packet, parent, view, view.captured_length());
  if (!llc || context.stopped()) {
    return {};
  }

  const auto dsap = context.read(view.read_u8(0));
  const auto ssap = context.read(view.read_u8(1));
  const auto first_control = context.read(view.read_u8(2));
  if (!dsap || !ssap || !first_control) {
    return {};
  }
  const auto control_length =
      (*first_control & 0x03U) == 0x03U ? std::size_t{1} : std::size_t{2};
  const auto control = control_length == 1
                           ? std::optional<std::uint16_t>{*first_control}
                           : context.read(view.read_le16(2));
  if (!control || !context.add_unsigned(state.dsap, *llc, view, 0, 1, *dsap) ||
      !context.add_unsigned(state.ssap, *llc, view, 1, 1, *ssap) ||
      !context.add_unsigned(state.control, *llc, view, 2, control_length,
                            *control) ||
      !context.add_unsigned(state.control_length, *llc, view, 0, 0,
                            control_length, ParsedNodeFlagGenerated)) {
    return {};
  }

  const auto header_length = 2 + control_length;
  const auto payload_length = view.reported_length() - header_length;
  const auto payload_result =
      view.subview(header_length, payload_length, payload_length);
  if (!payload_result.has_value()) {
    context.mark_malformed();
    return {};
  }
  const auto &payload = *payload_result.value();
  DissectionResult child;
  if (*dsap == kSnapSap && *ssap == kSnapSap) {
    child =
        context.dispatch_snap(is_information_frame(*control), payload, *llc);
  } else if (is_information_frame(*control)) {
    child = context.dispatch_llc_sap(*dsap, payload, *llc);
  } else {
    if (!context.add_unknown(*llc, payload, 0, payload_length)) {
      return {};
    }
    return {view.reported_length()};
  }
  if (context.stopped()) {
    return {};
  }
  if (child.consumed_length > payload_length) {
    context.mark_malformed();
  } else if (child.consumed_length < payload_length &&
             !context.add_unknown(*llc, payload, child.consumed_length,
                                  payload_length - child.consumed_length)) {
    return {};
  }
  return {view.reported_length()};
}

} // namespace pruftnet::parsing::internal

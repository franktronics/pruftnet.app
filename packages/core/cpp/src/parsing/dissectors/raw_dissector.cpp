#include "parsing/dissectors/raw_dissector.hpp"

#include "parsing/dissector_context.hpp"
#include "parsing/dissectors/dissector_states.hpp"

namespace pruftnet::parsing::internal {

DissectionResult dissect_raw(DissectorContext &context, const void *opaque,
                             const PacketView &view, std::uint32_t parent) {
  const auto &state = *static_cast<const RawDissectorState *>(opaque);
  const auto raw =
      context.add_protocol(state.packet, parent, view, view.captured_length());
  if (!raw || context.stopped()) {
    return {};
  }
  const auto first_byte = context.read(view.read_u8(0));
  if (!first_byte) {
    return {};
  }
  const auto version = *first_byte >> 4U;
  DissectionResult child;
  if (version == 4) {
    child = context.dispatch_ethertype(0x0800, view, *raw);
  } else if (version == 6) {
    child = context.dispatch_ethertype(0x86dd, view, *raw);
  } else {
    (void)context.add_unknown(*raw, view, 0, view.reported_length());
    return {view.reported_length()};
  }
  if (context.stopped()) {
    return {};
  }
  if (child.consumed_length < view.reported_length()) {
    (void)context.add_unknown(*raw, view, child.consumed_length,
                              view.reported_length() - child.consumed_length);
  }
  return {view.reported_length()};
}

} // namespace pruftnet::parsing::internal

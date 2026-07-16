#include "parsing/dissectors/link/frame_dissector.hpp"

#include "parsing/dissector_context.hpp"

namespace pruftnet::parsing::internal {

DissectionResult dissect_frame(DissectorContext &context, const void *opaque,
                               const PacketView &view, std::uint32_t parent) {
  const auto &state = *static_cast<const CommonDissectorState *>(opaque);
  const auto &metadata = context.packet().metadata;
  if (!context.add_unsigned(state.root_captured_length, parent, view, 0, 0,
                            metadata.captured_len, ParsedNodeFlagGenerated) ||
      !context.add_unsigned(state.root_reported_length, parent, view, 0, 0,
                            metadata.wire_len, ParsedNodeFlagGenerated) ||
      !context.add_unsigned(state.root_link_type, parent, view, 0, 0,
                            metadata.link_type, ParsedNodeFlagGenerated)) {
    return {};
  }
  if (metadata.captured_len > metadata.wire_len) {
    context.mark_malformed();
  } else if (context.packet().bytes.size() < metadata.captured_len ||
             view.captured_length() < metadata.wire_len ||
             (metadata.flags & sniffing::PacketFlagTruncated) != 0) {
    context.mark_partial();
  }
  return context.dispatch_dlt(metadata.link_type, view, parent);
}

} // namespace pruftnet::parsing::internal

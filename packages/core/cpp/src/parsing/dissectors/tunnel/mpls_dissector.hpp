#pragma once

#include "parsing/dissector.hpp"
#include "pruftnet/parsing/registry.hpp"

namespace pruftnet::parsing::internal {

struct MplsDissectorState {
  FieldId packet;
  FieldId entry;
  FieldId label;
  FieldId traffic_class;
  FieldId bottom_of_stack;
  FieldId ttl;
  FieldId payload_protocol;
  FieldId gach;
  FieldId gach_channel_indicator;
  FieldId gach_version;
  FieldId gach_reserved;
  FieldId gach_channel_type;
  FieldId payload;
};

[[nodiscard]] DissectionResult dissect_mpls(DissectorContext &context,
                                            const void *opaque,
                                            const PacketView &view,
                                            std::uint32_t parent);

} // namespace pruftnet::parsing::internal

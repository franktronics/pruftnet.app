#pragma once

#include "parsing/dissector.hpp"
#include "pruftnet/parsing/registry.hpp"

namespace pruftnet::parsing::internal {

struct CommonDissectorState {
  FieldId root_frame;
  FieldId root_captured_length;
  FieldId root_reported_length;
  FieldId root_link_type;
  FieldId unknown_data;
};

DissectionResult dissect_frame(DissectorContext &, const void *,
                               const PacketView &, std::uint32_t);

} // namespace pruftnet::parsing::internal

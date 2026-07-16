#pragma once

#include "parsing/dissector.hpp"
#include "pruftnet/parsing/registry.hpp"

namespace pruftnet::parsing::internal {

struct SnapDissectorState {
  FieldId packet;
  FieldId oui;
  FieldId pid;
  bool information_frame;
};

DissectionResult dissect_snap(DissectorContext &context, const void *opaque,
                              const PacketView &view, std::uint32_t parent);

} // namespace pruftnet::parsing::internal

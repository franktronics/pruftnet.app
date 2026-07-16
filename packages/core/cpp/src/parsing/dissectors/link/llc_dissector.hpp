#pragma once

#include "parsing/dissector.hpp"
#include "pruftnet/parsing/registry.hpp"

namespace pruftnet::parsing::internal {

struct LlcDissectorState {
  FieldId packet;
  FieldId dsap;
  FieldId ssap;
  FieldId control;
  FieldId control_length;
};

DissectionResult dissect_llc(DissectorContext &context, const void *opaque,
                             const PacketView &view, std::uint32_t parent);

} // namespace pruftnet::parsing::internal

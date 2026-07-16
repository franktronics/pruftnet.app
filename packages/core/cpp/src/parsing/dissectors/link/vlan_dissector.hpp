#pragma once

#include "parsing/dissector.hpp"
#include "pruftnet/parsing/registry.hpp"

namespace pruftnet::parsing::internal {

struct VlanDissectorState {
  FieldId tag;
  FieldId priority;
  FieldId drop_eligible;
  FieldId id;
  FieldId type;
  FieldId trailer;
};

DissectionResult dissect_vlan(DissectorContext &, const void *,
                              const PacketView &, std::uint32_t);

} // namespace pruftnet::parsing::internal

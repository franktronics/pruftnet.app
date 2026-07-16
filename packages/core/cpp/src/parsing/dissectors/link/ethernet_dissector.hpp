#pragma once

#include "parsing/dissector.hpp"
#include "pruftnet/parsing/registry.hpp"

namespace pruftnet::parsing::internal {

struct EthernetDissectorState {
  FieldId frame;
  FieldId destination;
  FieldId source;
  FieldId type;
  FieldId trailer;
};

DissectionResult dissect_ethernet(DissectorContext &, const void *,
                                  const PacketView &, std::uint32_t);

} // namespace pruftnet::parsing::internal

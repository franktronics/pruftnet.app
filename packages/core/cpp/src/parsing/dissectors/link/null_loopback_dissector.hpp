#pragma once

#include "parsing/dissector.hpp"
#include "pruftnet/parsing/registry.hpp"

namespace pruftnet::parsing::internal {

struct NullLoopbackDissectorState {
  FieldId packet;
  FieldId family;
  FieldId type;
  bool network_byte_order;
};

DissectionResult dissect_null_loopback(DissectorContext &, const void *,
                                       const PacketView &, std::uint32_t);

} // namespace pruftnet::parsing::internal

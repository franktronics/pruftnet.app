#pragma once

#include "parsing/dissector.hpp"

namespace pruftnet::parsing::internal {

DissectionResult dissect_lldp(DissectorContext &context, const void *opaque,
                              const PacketView &view, std::uint32_t parent);

} // namespace pruftnet::parsing::internal

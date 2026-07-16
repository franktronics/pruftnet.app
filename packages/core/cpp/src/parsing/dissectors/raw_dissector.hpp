#pragma once

#include "parsing/dissector.hpp"

namespace pruftnet::parsing::internal {

DissectionResult dissect_raw(DissectorContext &, const void *,
                             const PacketView &, std::uint32_t);

} // namespace pruftnet::parsing::internal

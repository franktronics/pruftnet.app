#pragma once

#include <cstdint>

#include "parsing/dissector.hpp"
#include "parsing/dissectors/dissector_states.hpp"

namespace pruftnet::parsing::internal {

[[nodiscard]] bool is_mld_type(std::uint8_t type) noexcept;
DissectionResult dissect_mld(DissectorContext &, const MldDissectorState &,
                             const PacketView &, std::uint32_t);

} // namespace pruftnet::parsing::internal

#pragma once

#include <cstdint>

#include "pruftnet/parsing/registry.hpp"

namespace pruftnet::parsing {
class PacketView;
}

namespace pruftnet::parsing::internal {

class DissectorContext;

[[nodiscard]] bool dissect_ethernet_payload(DissectorContext &context,
                                            std::uint16_t type_or_length,
                                            const PacketView &payload,
                                            std::uint32_t parent,
                                            FieldId trailer_field);

} // namespace pruftnet::parsing::internal

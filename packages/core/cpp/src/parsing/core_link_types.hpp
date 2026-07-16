#pragma once

#include <cstdint>
#include <span>

namespace pruftnet::parsing::internal {

enum class CoreLinkTypeKind : std::uint8_t {
  Ethernet,
  LinuxCookedV1,
  LinuxCookedV2,
  Null,
  Loop,
  Raw,
};

struct CoreLinkTypeDefinition {
  int value;
  CoreLinkTypeKind kind;
};

[[nodiscard]] std::span<const CoreLinkTypeDefinition> core_link_types();

} // namespace pruftnet::parsing::internal

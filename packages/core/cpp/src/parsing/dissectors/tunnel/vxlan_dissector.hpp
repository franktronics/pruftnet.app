#pragma once

#include "parsing/dissector.hpp"
#include "pruftnet/parsing/registry.hpp"

namespace pruftnet::parsing::internal {

enum class VxlanFlavor : std::uint8_t {
  Standard,
  Gpe,
};

struct VxlanDissectorState {
  FieldId packet;
  FieldId flags;
  FieldId version;
  FieldId instance;
  FieldId next_protocol_present;
  FieldId oam;
  FieldId group_policy_present;
  FieldId vni_present;
  FieldId dont_learn;
  FieldId policy_applied;
  FieldId reserved_flags;
  FieldId group_policy_id;
  FieldId reserved_16;
  FieldId next_protocol;
  FieldId vni;
  FieldId reserved_8;
  VxlanFlavor flavor;
};

[[nodiscard]] DissectionResult dissect_vxlan(DissectorContext &context,
                                             const void *opaque,
                                             const PacketView &view,
                                             std::uint32_t parent);

} // namespace pruftnet::parsing::internal

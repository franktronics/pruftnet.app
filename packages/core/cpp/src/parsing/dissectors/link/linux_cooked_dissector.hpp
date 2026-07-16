#pragma once

#include "parsing/dissector.hpp"
#include "pruftnet/parsing/registry.hpp"

namespace pruftnet::parsing::internal {

struct LinuxCookedDissectorState {
  FieldId packet;
  FieldId version_field;
  FieldId protocol;
  FieldId packet_type;
  FieldId hardware_type;
  FieldId address_length;
  FieldId address;
  FieldId address_padding;
  FieldId interface_index;
  FieldId reserved;
  std::uint8_t version;
};

DissectionResult dissect_linux_cooked(DissectorContext &, const void *,
                                      const PacketView &, std::uint32_t);

} // namespace pruftnet::parsing::internal

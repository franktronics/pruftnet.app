#pragma once

#include "parsing/dissector.hpp"
#include "pruftnet/parsing/registry.hpp"

namespace pruftnet::parsing::internal {

struct GeneveDissectorState {
  FieldId packet;
  FieldId version;
  FieldId option_length;
  FieldId flags;
  FieldId oam;
  FieldId critical_options;
  FieldId reserved_flags;
  FieldId protocol_type;
  FieldId vni;
  FieldId reserved;
  FieldId option;
  FieldId option_class;
  FieldId option_type;
  FieldId option_critical;
  FieldId option_reserved;
  FieldId option_data_length;
  FieldId option_data;
};

[[nodiscard]] DissectionResult dissect_geneve(DissectorContext &context,
                                              const void *opaque,
                                              const PacketView &view,
                                              std::uint32_t parent);

} // namespace pruftnet::parsing::internal

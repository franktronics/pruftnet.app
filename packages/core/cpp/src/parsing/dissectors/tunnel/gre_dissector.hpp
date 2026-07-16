#pragma once

#include "parsing/dissector.hpp"
#include "pruftnet/parsing/registry.hpp"

namespace pruftnet::parsing::internal {

struct GreDissectorState {
  FieldId packet;
  FieldId flags;
  FieldId checksum_present;
  FieldId routing_present;
  FieldId key_present;
  FieldId sequence_present;
  FieldId strict_source_route;
  FieldId recursion_control;
  FieldId acknowledgment_present;
  FieldId reserved;
  FieldId version;
  FieldId protocol_type;
  FieldId checksum;
  FieldId checksum_valid;
  FieldId offset;
  FieldId key;
  FieldId sequence_number;
  FieldId payload_length;
  FieldId call_id;
  FieldId acknowledgment_number;
  FieldId routing_entry;
  FieldId routing_address_family;
  FieldId routing_offset;
  FieldId routing_length;
  FieldId routing_information;
};

[[nodiscard]] DissectionResult dissect_gre(DissectorContext &context,
                                           const void *opaque,
                                           const PacketView &view,
                                           std::uint32_t parent);

} // namespace pruftnet::parsing::internal

#pragma once

#include "parsing/dissector.hpp"
#include "pruftnet/parsing/registry.hpp"

namespace pruftnet::parsing::internal {

struct LldpDissectorState {
  FieldId packet;
  FieldId tlv;
  FieldId tlv_type;
  FieldId tlv_length;
  FieldId tlv_value;
  FieldId chassis_subtype;
  FieldId chassis_id;
  FieldId port_subtype;
  FieldId port_id;
  FieldId address_family;
  FieldId ttl;
  FieldId port_description;
  FieldId system_name;
  FieldId system_description;
  FieldId system_capabilities;
  FieldId enabled_capabilities;
  FieldId management_address_length;
  FieldId management_address_subtype;
  FieldId management_address;
  FieldId management_interface_subtype;
  FieldId management_interface_number;
  FieldId management_oid;
  FieldId organization_oui;
  FieldId organization_subtype;
  FieldId organization_data;
};

DissectionResult dissect_lldp(DissectorContext &context, const void *opaque,
                              const PacketView &view, std::uint32_t parent);

} // namespace pruftnet::parsing::internal

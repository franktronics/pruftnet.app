#pragma once

#include <cstdint>

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

struct MplsDissectorState {
  FieldId packet;
  FieldId entry;
  FieldId label;
  FieldId traffic_class;
  FieldId bottom_of_stack;
  FieldId ttl;
  FieldId payload_protocol;
  FieldId gach;
  FieldId gach_channel_indicator;
  FieldId gach_version;
  FieldId gach_reserved;
  FieldId gach_channel_type;
  FieldId payload;
};

} // namespace pruftnet::parsing::internal

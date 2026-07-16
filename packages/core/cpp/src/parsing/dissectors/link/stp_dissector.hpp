#pragma once

#include "parsing/dissector.hpp"
#include "pruftnet/parsing/registry.hpp"

namespace pruftnet::parsing::internal {

struct MstpDissectorState {
  FieldId extension;
  FieldId version_3_length;
  FieldId config_format_selector;
  FieldId config_name;
  FieldId config_revision;
  FieldId config_digest;
  FieldId cist_internal_root_path_cost;
  FieldId cist_bridge_priority;
  FieldId cist_bridge_system_id_extension;
  FieldId cist_bridge_mac;
  FieldId cist_remaining_hops;
  FieldId instance;
  FieldId instance_flags;
  FieldId instance_root_priority;
  FieldId instance_id;
  FieldId instance_regional_root_mac;
  FieldId instance_internal_root_path_cost;
  FieldId instance_bridge_priority;
  FieldId instance_port_priority;
  FieldId instance_remaining_hops;
};

struct StpDissectorState {
  FieldId packet;
  FieldId protocol_identifier;
  FieldId version;
  FieldId type;
  FieldId flags;
  FieldId root_priority;
  FieldId root_system_id_extension;
  FieldId root_mac;
  FieldId root_path_cost;
  FieldId bridge_priority;
  FieldId bridge_system_id_extension;
  FieldId bridge_mac;
  FieldId port_id;
  FieldId message_age;
  FieldId max_age;
  FieldId hello_time;
  FieldId forward_delay;
  FieldId version_1_length;
  FieldId body;
  MstpDissectorState mstp;
};

DissectionResult dissect_stp(DissectorContext &context, const void *opaque,
                             const PacketView &view, std::uint32_t parent);

} // namespace pruftnet::parsing::internal

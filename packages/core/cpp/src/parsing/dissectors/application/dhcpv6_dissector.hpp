#pragma once

#include "parsing/dissector.hpp"
#include "pruftnet/parsing/registry.hpp"

namespace pruftnet::parsing::internal {

struct Dhcpv6DissectorState {
  FieldId message;
  FieldId message_type;
  FieldId transaction_id;
  FieldId hop_count;
  FieldId link_address;
  FieldId peer_address;
  FieldId option;
  FieldId option_code;
  FieldId option_length;
  FieldId option_data;
  FieldId duid;
  FieldId duid_type;
  FieldId duid_hardware_type;
  FieldId duid_time;
  FieldId duid_enterprise;
  FieldId duid_identifier;
  FieldId iaid;
  FieldId t1;
  FieldId t2;
  FieldId address;
  FieldId preferred_lifetime;
  FieldId valid_lifetime;
  FieldId prefix_length;
  FieldId prefix;
  FieldId requested_option;
  FieldId preference;
  FieldId elapsed_time;
  FieldId status_code;
  FieldId status_message;
  FieldId dns_server;
  FieldId domain_search;
  FieldId relay_message;
  FieldId interface_id;
  FieldId rapid_commit;
  FieldId information_refresh_time;
  FieldId sol_max_rt;
  FieldId inf_max_rt;
  FieldId trailing;
};

DissectionResult dissect_dhcpv6(DissectorContext &, const void *,
                                const PacketView &, std::uint32_t);

} // namespace pruftnet::parsing::internal

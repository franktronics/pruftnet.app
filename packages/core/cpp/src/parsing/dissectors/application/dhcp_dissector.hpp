#pragma once

#include "parsing/dissector.hpp"
#include "pruftnet/parsing/registry.hpp"

namespace pruftnet::parsing::internal {

struct DhcpDissectorState {
  FieldId message;
  FieldId operation;
  FieldId hardware_type;
  FieldId hardware_length;
  FieldId hops;
  FieldId transaction_id;
  FieldId seconds;
  FieldId flags;
  FieldId broadcast;
  FieldId client_address;
  FieldId your_address;
  FieldId server_address;
  FieldId relay_address;
  FieldId client_hardware_address;
  FieldId client_hardware_padding;
  FieldId server_name;
  FieldId boot_file;
  FieldId magic_cookie;
  FieldId option;
  FieldId option_code;
  FieldId option_length;
  FieldId option_data;
  FieldId message_type;
  FieldId subnet_mask;
  FieldId router;
  FieldId dns_server;
  FieldId host_name;
  FieldId domain_name;
  FieldId requested_address;
  FieldId lease_time;
  FieldId server_identifier;
  FieldId parameter_request;
  FieldId maximum_message_size;
  FieldId renewal_time;
  FieldId rebinding_time;
  FieldId vendor_class;
  FieldId client_identifier;
  FieldId overload;
  FieldId relay_suboption;
  FieldId relay_suboption_code;
  FieldId relay_suboption_length;
  FieldId relay_suboption_data;
  FieldId end;
  FieldId padding;
  FieldId trailing;
};

DissectionResult dissect_dhcp(DissectorContext &, const void *,
                              const PacketView &, std::uint32_t);

} // namespace pruftnet::parsing::internal

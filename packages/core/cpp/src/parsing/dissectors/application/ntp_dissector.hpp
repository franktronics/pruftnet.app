#pragma once

#include "parsing/dissector.hpp"
#include "pruftnet/parsing/registry.hpp"

namespace pruftnet::parsing::internal {

struct NtpDissectorState {
  FieldId message;
  FieldId flags;
  FieldId leap_indicator;
  FieldId version;
  FieldId mode;
  FieldId stratum;
  FieldId poll;
  FieldId precision;
  FieldId root_delay;
  FieldId root_dispersion;
  FieldId reference_id;
  FieldId reference_timestamp;
  FieldId origin_timestamp;
  FieldId receive_timestamp;
  FieldId transmit_timestamp;
  FieldId extension;
  FieldId extension_type;
  FieldId extension_length;
  FieldId extension_value;
  FieldId key_id;
  FieldId digest;
  FieldId control_flags;
  FieldId control_response;
  FieldId control_error;
  FieldId control_more;
  FieldId control_opcode;
  FieldId control_sequence;
  FieldId control_status;
  FieldId control_association_id;
  FieldId control_offset;
  FieldId control_count;
  FieldId control_data;
  FieldId private_flags;
  FieldId private_response;
  FieldId private_more;
  FieldId private_auth;
  FieldId private_sequence;
  FieldId private_implementation;
  FieldId private_request_code;
  FieldId private_error_code;
  FieldId private_item_count;
  FieldId private_item_size;
  FieldId private_data;
  FieldId trailing;
};

DissectionResult dissect_ntp(DissectorContext &, const void *,
                             const PacketView &, std::uint32_t);

} // namespace pruftnet::parsing::internal

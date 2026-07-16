#pragma once

#include "parsing/dissector.hpp"
#include "pruftnet/parsing/registry.hpp"

namespace pruftnet::parsing::internal {

struct IgmpDissectorState {
  FieldId packet;
  FieldId type;
  FieldId version;
  FieldId max_response_code;
  FieldId max_response_time;
  FieldId checksum;
  FieldId checksum_valid;
  FieldId group_address;
  FieldId reserved;
  FieldId suppress;
  FieldId qrv;
  FieldId qqic;
  FieldId query_interval;
  FieldId source_count;
  FieldId source_address;
  FieldId record_count;
  FieldId record;
  FieldId record_type;
  FieldId aux_data_length;
  FieldId record_source_count;
  FieldId record_multicast_address;
  FieldId record_source_address;
  FieldId aux_data;
  FieldId trailing;
};

DissectionResult dissect_igmp(DissectorContext &, const void *,
                              const PacketView &, std::uint32_t);

} // namespace pruftnet::parsing::internal

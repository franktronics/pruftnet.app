#pragma once

#include <cstdint>

#include "parsing/dissector.hpp"
#include "pruftnet/parsing/registry.hpp"

namespace pruftnet::parsing::internal {

struct MldDissectorState {
  FieldId message;
  FieldId version;
  FieldId maximum_response_code;
  FieldId maximum_response_delay;
  FieldId reserved;
  FieldId multicast_address;
  FieldId flags;
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

[[nodiscard]] bool is_mld_type(std::uint8_t type) noexcept;
DissectionResult dissect_mld(DissectorContext &, const MldDissectorState &,
                             const PacketView &, std::uint32_t);

} // namespace pruftnet::parsing::internal

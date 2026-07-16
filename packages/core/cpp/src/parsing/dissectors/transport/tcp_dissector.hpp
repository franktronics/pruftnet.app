#pragma once

#include "parsing/dissector.hpp"
#include "pruftnet/parsing/registry.hpp"

namespace pruftnet::parsing::internal {

struct TcpDissectorState {
  FieldId segment;
  FieldId source_port;
  FieldId destination_port;
  FieldId sequence_number;
  FieldId acknowledgment_number;
  FieldId header_length;
  FieldId reserved;
  FieldId flags;
  FieldId window;
  FieldId checksum;
  FieldId urgent_pointer;
  FieldId options;
  FieldId payload;
  FieldId reassembled;
  FieldId reassembled_length;
  FieldId reassembled_segment_count;
  FieldId reassembly_overlap;
  FieldId reassembly_conflict;
};

DissectionResult dissect_tcp(DissectorContext &, const void *,
                             const PacketView &, std::uint32_t);

} // namespace pruftnet::parsing::internal

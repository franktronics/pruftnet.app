#pragma once

#include "parsing/dissector.hpp"
#include "pruftnet/parsing/registry.hpp"

namespace pruftnet::parsing::internal {

struct Ipv6DissectorState {
  FieldId packet;
  FieldId version;
  FieldId traffic_class;
  FieldId flow_label;
  FieldId payload_length;
  FieldId next_header;
  FieldId hop_limit;
  FieldId source;
  FieldId destination;
  FieldId extension;
  FieldId extension_next_header;
  FieldId extension_length;
  FieldId extension_type;
  FieldId extension_data;
  FieldId fragment_offset_encoded;
  FieldId fragment_offset;
  FieldId fragment_reserved_octet;
  FieldId fragment_reserved;
  FieldId fragment_more;
  FieldId fragment_atomic;
  FieldId fragment_identification;
  FieldId reassembled;
  FieldId reassembled_length;
  FieldId reassembled_fragment_count;
  FieldId fragment_overlap;
};

DissectionResult dissect_ipv6(DissectorContext &, const void *,
                              const PacketView &, std::uint32_t);

} // namespace pruftnet::parsing::internal

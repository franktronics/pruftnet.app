#pragma once

#include "parsing/dissector.hpp"
#include "pruftnet/parsing/registry.hpp"

namespace pruftnet::parsing::internal {

struct Ipv4DissectorState {
  FieldId packet;
  FieldId version;
  FieldId header_length;
  FieldId dscp_ecn;
  FieldId total_length;
  FieldId identification;
  FieldId flags;
  FieldId reserved_flag;
  FieldId dont_fragment;
  FieldId more_fragments;
  FieldId fragment_offset_encoded;
  FieldId fragment_offset;
  FieldId reassembled;
  FieldId reassembled_length;
  FieldId reassembled_fragment_count;
  FieldId fragment_overlap;
  FieldId ttl;
  FieldId protocol;
  FieldId checksum;
  FieldId source;
  FieldId destination;
  FieldId options;
};

DissectionResult dissect_ipv4(DissectorContext &, const void *,
                              const PacketView &, std::uint32_t);

} // namespace pruftnet::parsing::internal

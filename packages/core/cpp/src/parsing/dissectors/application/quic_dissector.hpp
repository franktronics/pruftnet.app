#pragma once

#include "parsing/dissector.hpp"
#include "pruftnet/parsing/registry.hpp"

namespace pruftnet::parsing::internal {

struct QuicDissectorState {
  FieldId packet;
  FieldId packet_type;
  FieldId packet_length;
  FieldId coalesced_index;
  FieldId header_form;
  FieldId fixed_bit;
  FieldId long_packet_type_bits;
  FieldId type_specific_bits;
  FieldId version;
  FieldId destination_connection_id_length;
  FieldId destination_connection_id;
  FieldId source_connection_id_length;
  FieldId source_connection_id;
  FieldId token_length;
  FieldId token;
  FieldId length;
  FieldId protected_payload;
  FieldId supported_version;
  FieldId retry_token;
  FieldId retry_integrity_tag;
  FieldId spin_bit;
  FieldId short_protected_bits;
  FieldId version_specific_data;
};

DissectionResult dissect_quic(DissectorContext &, const void *,
                              const PacketView &, std::uint32_t);

} // namespace pruftnet::parsing::internal

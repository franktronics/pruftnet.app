#pragma once

#include "parsing/dissector.hpp"
#include "parsing/dissectors/network/icmp_extension.hpp"
#include "pruftnet/parsing/registry.hpp"

namespace pruftnet::parsing::internal {

struct Icmpv4DissectorState {
  FieldId message;
  FieldId type;
  FieldId code;
  FieldId checksum;
  FieldId identifier;
  FieldId sequence;
  FieldId gateway;
  FieldId pointer;
  FieldId mtu;
  FieldId body;
  FieldId quoted;
  FieldId original_datagram_length_words;
  FieldId original_datagram_length;
  FieldId extended_sequence;
  FieldId extended_flags;
  FieldId originate_timestamp;
  FieldId receive_timestamp;
  FieldId transmit_timestamp;
  FieldId address_mask;
  FieldId router_address_count;
  FieldId router_entry_size;
  FieldId router_lifetime;
  FieldId router_entry;
  FieldId router_address;
  FieldId router_preference;
  IcmpExtensionDissectorState extension;
};

DissectionResult dissect_icmpv4(DissectorContext &, const void *,
                                const PacketView &, std::uint32_t);

} // namespace pruftnet::parsing::internal

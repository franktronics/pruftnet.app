#pragma once

#include "parsing/dissector.hpp"
#include "parsing/dissectors/network/icmp_extension.hpp"
#include "parsing/dissectors/network/mld_dissector.hpp"
#include "pruftnet/parsing/registry.hpp"

namespace pruftnet::parsing::internal {

struct Icmpv6DissectorState {
  FieldId message;
  FieldId type;
  FieldId code;
  FieldId checksum;
  FieldId informational;
  FieldId identifier;
  FieldId sequence;
  FieldId mtu;
  FieldId pointer;
  FieldId target;
  FieldId destination;
  FieldId flags;
  FieldId current_hop_limit;
  FieldId router_lifetime;
  FieldId reachable_time;
  FieldId retrans_timer;
  FieldId body;
  FieldId quoted;
  FieldId option;
  FieldId option_type;
  FieldId option_length;
  FieldId option_body;
  FieldId redirected_packet;
  FieldId link_layer_address;
  FieldId prefix_length;
  FieldId prefix_flags;
  FieldId valid_lifetime;
  FieldId preferred_lifetime;
  FieldId prefix;
  FieldId original_datagram_length_words;
  FieldId original_datagram_length;
  FieldId extended_sequence;
  FieldId extended_flags;
  IcmpExtensionDissectorState extension;
  MldDissectorState mld;
};

DissectionResult dissect_icmpv6(DissectorContext &, const void *,
                                const PacketView &, std::uint32_t);

} // namespace pruftnet::parsing::internal

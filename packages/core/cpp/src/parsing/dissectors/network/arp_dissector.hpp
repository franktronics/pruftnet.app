#pragma once

#include "parsing/dissector.hpp"
#include "pruftnet/parsing/registry.hpp"

namespace pruftnet::parsing::internal {

struct ArpDissectorState {
  FieldId packet;
  FieldId reverse_packet;
  FieldId inverse_packet;
  FieldId hardware_type;
  FieldId protocol_type;
  FieldId hardware_length;
  FieldId protocol_length;
  FieldId operation;
  FieldId sender_hardware;
  FieldId sender_protocol;
  FieldId target_hardware;
  FieldId target_protocol;
};

DissectionResult dissect_arp(DissectorContext &, const void *,
                             const PacketView &, std::uint32_t);

} // namespace pruftnet::parsing::internal

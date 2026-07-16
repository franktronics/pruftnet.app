#pragma once

#include "parsing/dissector.hpp"
#include "pruftnet/parsing/registry.hpp"

namespace pruftnet::parsing::internal {

struct UdpDissectorState {
  FieldId datagram;
  FieldId source_port;
  FieldId destination_port;
  FieldId length;
  FieldId checksum;
  FieldId payload;
};

DissectionResult dissect_udp(DissectorContext &, const void *,
                             const PacketView &, std::uint32_t);

} // namespace pruftnet::parsing::internal

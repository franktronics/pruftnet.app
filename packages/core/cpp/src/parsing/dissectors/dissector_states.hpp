#pragma once

#include "pruftnet/parsing/registry.hpp"

namespace pruftnet::parsing::internal {

struct CommonDissectorState {
    FieldId root_frame;
    FieldId root_captured_length;
    FieldId root_reported_length;
    FieldId root_link_type;
    FieldId unknown_data;
};

struct EthernetDissectorState {
    FieldId frame;
    FieldId destination;
    FieldId source;
    FieldId type;
};

struct Ipv4DissectorState {
    FieldId packet;
    FieldId version;
    FieldId header_length;
    FieldId dscp_ecn;
    FieldId total_length;
    FieldId identification;
    FieldId flags;
    FieldId fragment_offset;
    FieldId ttl;
    FieldId protocol;
    FieldId checksum;
    FieldId source;
    FieldId destination;
    FieldId options;
};

struct UdpDissectorState {
    FieldId datagram;
    FieldId source_port;
    FieldId destination_port;
    FieldId length;
    FieldId checksum;
    FieldId payload;
};

struct VlanDissectorState {
    FieldId tag;
    FieldId priority;
    FieldId drop_eligible;
    FieldId id;
    FieldId type;
};

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
};

} // namespace pruftnet::parsing::internal

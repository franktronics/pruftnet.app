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

struct ArpDissectorState {
    FieldId packet;
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
    FieldId fragment_reserved;
    FieldId fragment_more;
    FieldId fragment_identification;
};

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
};

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
};

} // namespace pruftnet::parsing::internal

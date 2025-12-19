#pragma once

#include "protocol_types.hpp"

// ============================================================================
// LAYER 3 - Network Layer Protocol Definitions
// References: RFC 791 (IPv4), RFC 8200 (IPv6), RFC 792 (ICMP), RFC 4443 (ICMPv6)
// RFC 1112 (IGMP), RFC 2784 (GRE), RFC 4302/4303 (IPSec)
// ============================================================================

// Field ID namespaces
namespace Ipv4Fields {
    constexpr uint8_t VERSION = 0;
    constexpr uint8_t IHL = 1;
    constexpr uint8_t DSCP = 2;
    constexpr uint8_t ECN = 3;
    constexpr uint8_t TOTAL_LENGTH = 4;
    constexpr uint8_t IDENTIFICATION = 5;
    constexpr uint8_t FLAGS = 6;
    constexpr uint8_t FRAGMENT_OFFSET = 7;
    constexpr uint8_t TTL = 8;
    constexpr uint8_t PROTOCOL = 9;
    constexpr uint8_t HEADER_CHECKSUM = 10;
    constexpr uint8_t SRC_IP = 11;
    constexpr uint8_t DEST_IP = 12;
}

namespace Ipv6Fields {
    constexpr uint8_t VERSION = 0;
    constexpr uint8_t TRAFFIC_CLASS = 1;
    constexpr uint8_t FLOW_LABEL = 2;
    constexpr uint8_t PAYLOAD_LENGTH = 3;
    constexpr uint8_t NEXT_HEADER = 4;
    constexpr uint8_t HOP_LIMIT = 5;
    constexpr uint8_t SRC_IP = 6;
    constexpr uint8_t DEST_IP = 7;
}

namespace IcmpFields {
    constexpr uint8_t TYPE = 0;
    constexpr uint8_t CODE = 1;
    constexpr uint8_t CHECKSUM = 2;
    constexpr uint8_t REST_OF_HEADER = 3;
}

namespace Icmpv6Fields {
    constexpr uint8_t TYPE = 0;
    constexpr uint8_t CODE = 1;
    constexpr uint8_t CHECKSUM = 2;
    constexpr uint8_t MESSAGE_BODY = 3;
}

namespace IgmpFields {
    constexpr uint8_t TYPE = 0;
    constexpr uint8_t MAX_RESP_TIME = 1;
    constexpr uint8_t CHECKSUM = 2;
    constexpr uint8_t GROUP_ADDRESS = 3;
}

namespace GreFields {
    constexpr uint8_t FLAGS = 0;          // 16 bits
    constexpr uint8_t PROTOCOL_TYPE = 1;  // 16 bits
    constexpr uint8_t CHECKSUM = 2;       // Optional 16 bits
    constexpr uint8_t KEY = 3;            // Optional 32 bits
    constexpr uint8_t SEQUENCE = 4;       // Optional 32 bits
}

namespace EspFields {
    constexpr uint8_t SPI = 0;            // Security Parameters Index
    constexpr uint8_t SEQUENCE = 1;       // Sequence Number
}

namespace AhFields {
    constexpr uint8_t NEXT_HEADER = 0;
    constexpr uint8_t PAYLOAD_LENGTH = 1;
    constexpr uint8_t RESERVED = 2;
    constexpr uint8_t SPI = 3;            // Security Parameters Index
    constexpr uint8_t SEQUENCE = 4;
}

namespace Ipv6ExtFields {
    constexpr uint8_t NEXT_HEADER = 0;
    constexpr uint8_t LENGTH = 1;
}

namespace OspfFields {
    constexpr uint8_t VERSION = 0;
    constexpr uint8_t TYPE = 1;
    constexpr uint8_t PACKET_LENGTH = 2;
    constexpr uint8_t ROUTER_ID = 3;
    constexpr uint8_t AREA_ID = 4;
    constexpr uint8_t CHECKSUM = 5;
}

// ============================================================================
// Protocol Definitions
// ============================================================================

// IPv4 - RFC 791
constexpr ProtocolDefinition IPV4_DEFINITION = {
    .id = ProtocolId::IPV4,
    .header_size_bytes = 20,
    .field_count = 13,
    .next_protocol_field_id = Ipv4Fields::PROTOCOL,
    .next_protocol_mapping_count = 13,
    .fields = {{
        { .bit_offset = 0,   .bit_length = 4,  .field_id = Ipv4Fields::VERSION },
        { .bit_offset = 4,   .bit_length = 4,  .field_id = Ipv4Fields::IHL },
        { .bit_offset = 8,   .bit_length = 6,  .field_id = Ipv4Fields::DSCP },
        { .bit_offset = 14,  .bit_length = 2,  .field_id = Ipv4Fields::ECN },
        { .bit_offset = 16,  .bit_length = 16, .field_id = Ipv4Fields::TOTAL_LENGTH },
        { .bit_offset = 32,  .bit_length = 16, .field_id = Ipv4Fields::IDENTIFICATION },
        { .bit_offset = 48,  .bit_length = 3,  .field_id = Ipv4Fields::FLAGS },
        { .bit_offset = 51,  .bit_length = 13, .field_id = Ipv4Fields::FRAGMENT_OFFSET },
        { .bit_offset = 64,  .bit_length = 8,  .field_id = Ipv4Fields::TTL },
        { .bit_offset = 72,  .bit_length = 8,  .field_id = Ipv4Fields::PROTOCOL },
        { .bit_offset = 80,  .bit_length = 16, .field_id = Ipv4Fields::HEADER_CHECKSUM },
        { .bit_offset = 96,  .bit_length = 32, .field_id = Ipv4Fields::SRC_IP },
        { .bit_offset = 128, .bit_length = 32, .field_id = Ipv4Fields::DEST_IP },
    }},
    .next_protocol_mappings = {{
        { .field_value = 1,   .next_protocol = ProtocolId::ICMP },
        { .field_value = 2,   .next_protocol = ProtocolId::IGMP },
        { .field_value = 4,   .next_protocol = ProtocolId::IPIP },
        { .field_value = 6,   .next_protocol = ProtocolId::TCP },
        { .field_value = 17,  .next_protocol = ProtocolId::UDP },
        { .field_value = 41,  .next_protocol = ProtocolId::IPV6_IN_IPV4 },
        { .field_value = 47,  .next_protocol = ProtocolId::GRE },
        { .field_value = 50,  .next_protocol = ProtocolId::ESP },
        { .field_value = 51,  .next_protocol = ProtocolId::AH },
        { .field_value = 89,  .next_protocol = ProtocolId::OSPF },
        { .field_value = 132, .next_protocol = ProtocolId::SCTP },
        { .field_value = 33,  .next_protocol = ProtocolId::DCCP },
        { .field_value = 136, .next_protocol = ProtocolId::UDPLITE },
    }}
};

// IPv6 - RFC 8200
constexpr ProtocolDefinition IPV6_DEFINITION = {
    .id = ProtocolId::IPV6,
    .header_size_bytes = 40,
    .field_count = 8,
    .next_protocol_field_id = Ipv6Fields::NEXT_HEADER,
    .next_protocol_mapping_count = 16,
    .fields = {{
        { .bit_offset = 0,   .bit_length = 4,   .field_id = Ipv6Fields::VERSION },
        { .bit_offset = 4,   .bit_length = 8,   .field_id = Ipv6Fields::TRAFFIC_CLASS },
        { .bit_offset = 12,  .bit_length = 20,  .field_id = Ipv6Fields::FLOW_LABEL },
        { .bit_offset = 32,  .bit_length = 16,  .field_id = Ipv6Fields::PAYLOAD_LENGTH },
        { .bit_offset = 48,  .bit_length = 8,   .field_id = Ipv6Fields::NEXT_HEADER },
        { .bit_offset = 56,  .bit_length = 8,   .field_id = Ipv6Fields::HOP_LIMIT },
        { .bit_offset = 64,  .bit_length = 128, .field_id = Ipv6Fields::SRC_IP },
        { .bit_offset = 192, .bit_length = 128, .field_id = Ipv6Fields::DEST_IP },
    }},
    .next_protocol_mappings = {{
        { .field_value = 0,   .next_protocol = ProtocolId::IPV6_HOPOPT },
        { .field_value = 6,   .next_protocol = ProtocolId::TCP },
        { .field_value = 17,  .next_protocol = ProtocolId::UDP },
        { .field_value = 43,  .next_protocol = ProtocolId::IPV6_ROUTING },
        { .field_value = 44,  .next_protocol = ProtocolId::IPV6_FRAGMENT },
        { .field_value = 50,  .next_protocol = ProtocolId::ESP },
        { .field_value = 51,  .next_protocol = ProtocolId::AH },
        { .field_value = 58,  .next_protocol = ProtocolId::ICMPV6 },
        { .field_value = 59,  .next_protocol = ProtocolId::RAW_PAYLOAD },
        { .field_value = 60,  .next_protocol = ProtocolId::IPV6_DSTOPT },
        { .field_value = 41,  .next_protocol = ProtocolId::IPV6 },
        { .field_value = 47,  .next_protocol = ProtocolId::GRE },
        { .field_value = 89,  .next_protocol = ProtocolId::OSPF },
        { .field_value = 132, .next_protocol = ProtocolId::SCTP },
        { .field_value = 33,  .next_protocol = ProtocolId::DCCP },
        { .field_value = 136, .next_protocol = ProtocolId::UDPLITE },
    }}
};

// ICMP - RFC 792
constexpr ProtocolDefinition ICMP_DEFINITION = {
    .id = ProtocolId::ICMP,
    .header_size_bytes = 8,
    .field_count = 4,
    .next_protocol_field_id = 255,
    .next_protocol_mapping_count = 0,
    .fields = {{
        { .bit_offset = 0,  .bit_length = 8,  .field_id = IcmpFields::TYPE },
        { .bit_offset = 8,  .bit_length = 8,  .field_id = IcmpFields::CODE },
        { .bit_offset = 16, .bit_length = 16, .field_id = IcmpFields::CHECKSUM },
        { .bit_offset = 32, .bit_length = 32, .field_id = IcmpFields::REST_OF_HEADER },
    }},
    .next_protocol_mappings = {{}}
};

// ICMPv6 - RFC 4443
constexpr ProtocolDefinition ICMPV6_DEFINITION = {
    .id = ProtocolId::ICMPV6,
    .header_size_bytes = 8,
    .field_count = 4,
    .next_protocol_field_id = 255,
    .next_protocol_mapping_count = 0,
    .fields = {{
        { .bit_offset = 0,  .bit_length = 8,  .field_id = Icmpv6Fields::TYPE },
        { .bit_offset = 8,  .bit_length = 8,  .field_id = Icmpv6Fields::CODE },
        { .bit_offset = 16, .bit_length = 16, .field_id = Icmpv6Fields::CHECKSUM },
        { .bit_offset = 32, .bit_length = 32, .field_id = Icmpv6Fields::MESSAGE_BODY },
    }},
    .next_protocol_mappings = {{}}
};

// IGMP - RFC 1112
constexpr ProtocolDefinition IGMP_DEFINITION = {
    .id = ProtocolId::IGMP,
    .header_size_bytes = 8,
    .field_count = 4,
    .next_protocol_field_id = 255,
    .next_protocol_mapping_count = 0,
    .fields = {{
        { .bit_offset = 0,  .bit_length = 8,  .field_id = IgmpFields::TYPE },
        { .bit_offset = 8,  .bit_length = 8,  .field_id = IgmpFields::MAX_RESP_TIME },
        { .bit_offset = 16, .bit_length = 16, .field_id = IgmpFields::CHECKSUM },
        { .bit_offset = 32, .bit_length = 32, .field_id = IgmpFields::GROUP_ADDRESS },
    }},
    .next_protocol_mappings = {{}}
};

// GRE - RFC 2784
constexpr ProtocolDefinition GRE_DEFINITION = {
    .id = ProtocolId::GRE,
    .header_size_bytes = 4,  // Minimum, can be longer with options
    .field_count = 2,
    .next_protocol_field_id = GreFields::PROTOCOL_TYPE,
    .next_protocol_mapping_count = 3,
    .fields = {{
        { .bit_offset = 0,  .bit_length = 16, .field_id = GreFields::FLAGS },
        { .bit_offset = 16, .bit_length = 16, .field_id = GreFields::PROTOCOL_TYPE },
    }},
    .next_protocol_mappings = {{
        { .field_value = 0x0800, .next_protocol = ProtocolId::IPV4 },
        { .field_value = 0x86DD, .next_protocol = ProtocolId::IPV6 },
        { .field_value = 0x6558, .next_protocol = ProtocolId::ETHERNET },  // Transparent Ethernet Bridging
    }}
};

// ESP - RFC 4303 (Encapsulating Security Payload)
constexpr ProtocolDefinition ESP_DEFINITION = {
    .id = ProtocolId::ESP,
    .header_size_bytes = 8,  // SPI + Sequence, payload is encrypted
    .field_count = 2,
    .next_protocol_field_id = 255,  // Encrypted, can't determine next protocol
    .next_protocol_mapping_count = 0,
    .fields = {{
        { .bit_offset = 0,  .bit_length = 32, .field_id = EspFields::SPI },
        { .bit_offset = 32, .bit_length = 32, .field_id = EspFields::SEQUENCE },
    }},
    .next_protocol_mappings = {{}}
};

// AH - RFC 4302 (Authentication Header)
constexpr ProtocolDefinition AH_DEFINITION = {
    .id = ProtocolId::AH,
    .header_size_bytes = 12,  // Minimum
    .field_count = 5,
    .next_protocol_field_id = AhFields::NEXT_HEADER,
    .next_protocol_mapping_count = 3,
    .fields = {{
        { .bit_offset = 0,  .bit_length = 8,  .field_id = AhFields::NEXT_HEADER },
        { .bit_offset = 8,  .bit_length = 8,  .field_id = AhFields::PAYLOAD_LENGTH },
        { .bit_offset = 16, .bit_length = 16, .field_id = AhFields::RESERVED },
        { .bit_offset = 32, .bit_length = 32, .field_id = AhFields::SPI },
        { .bit_offset = 64, .bit_length = 32, .field_id = AhFields::SEQUENCE },
    }},
    .next_protocol_mappings = {{
        { .field_value = 6,  .next_protocol = ProtocolId::TCP },
        { .field_value = 17, .next_protocol = ProtocolId::UDP },
        { .field_value = 50, .next_protocol = ProtocolId::ESP },
    }}
};

// OSPF - RFC 2328 (Open Shortest Path First)
constexpr ProtocolDefinition OSPF_DEFINITION = {
    .id = ProtocolId::OSPF,
    .header_size_bytes = 24,
    .field_count = 6,
    .next_protocol_field_id = 255,  // Terminal
    .next_protocol_mapping_count = 0,
    .fields = {{
        { .bit_offset = 0,   .bit_length = 8,  .field_id = OspfFields::VERSION },
        { .bit_offset = 8,   .bit_length = 8,  .field_id = OspfFields::TYPE },
        { .bit_offset = 16,  .bit_length = 16, .field_id = OspfFields::PACKET_LENGTH },
        { .bit_offset = 32,  .bit_length = 32, .field_id = OspfFields::ROUTER_ID },
        { .bit_offset = 64,  .bit_length = 32, .field_id = OspfFields::AREA_ID },
        { .bit_offset = 96,  .bit_length = 16, .field_id = OspfFields::CHECKSUM },
    }},
    .next_protocol_mappings = {{}}
};

// IPv6 Extension Headers - RFC 8200
// Hop-by-Hop Options
constexpr ProtocolDefinition IPV6_HOPOPT_DEFINITION = {
    .id = ProtocolId::IPV6_HOPOPT,
    .header_size_bytes = 8,  // Minimum, variable length
    .field_count = 2,
    .next_protocol_field_id = Ipv6ExtFields::NEXT_HEADER,
    .next_protocol_mapping_count = 3,
    .fields = {{
        { .bit_offset = 0, .bit_length = 8, .field_id = Ipv6ExtFields::NEXT_HEADER },
        { .bit_offset = 8, .bit_length = 8, .field_id = Ipv6ExtFields::LENGTH },
    }},
    .next_protocol_mappings = {{
        { .field_value = 6,  .next_protocol = ProtocolId::TCP },
        { .field_value = 17, .next_protocol = ProtocolId::UDP },
        { .field_value = 58, .next_protocol = ProtocolId::ICMPV6 },
    }}
};

// Routing Header
constexpr ProtocolDefinition IPV6_ROUTING_DEFINITION = {
    .id = ProtocolId::IPV6_ROUTING,
    .header_size_bytes = 8,
    .field_count = 2,
    .next_protocol_field_id = Ipv6ExtFields::NEXT_HEADER,
    .next_protocol_mapping_count = 3,
    .fields = {{
        { .bit_offset = 0, .bit_length = 8, .field_id = Ipv6ExtFields::NEXT_HEADER },
        { .bit_offset = 8, .bit_length = 8, .field_id = Ipv6ExtFields::LENGTH },
    }},
    .next_protocol_mappings = {{
        { .field_value = 6,  .next_protocol = ProtocolId::TCP },
        { .field_value = 17, .next_protocol = ProtocolId::UDP },
        { .field_value = 58, .next_protocol = ProtocolId::ICMPV6 },
    }}
};

// Fragment Header
constexpr ProtocolDefinition IPV6_FRAGMENT_DEFINITION = {
    .id = ProtocolId::IPV6_FRAGMENT,
    .header_size_bytes = 8,
    .field_count = 2,
    .next_protocol_field_id = Ipv6ExtFields::NEXT_HEADER,
    .next_protocol_mapping_count = 3,
    .fields = {{
        { .bit_offset = 0, .bit_length = 8, .field_id = Ipv6ExtFields::NEXT_HEADER },
        { .bit_offset = 8, .bit_length = 8, .field_id = Ipv6ExtFields::LENGTH },
    }},
    .next_protocol_mappings = {{
        { .field_value = 6,  .next_protocol = ProtocolId::TCP },
        { .field_value = 17, .next_protocol = ProtocolId::UDP },
        { .field_value = 58, .next_protocol = ProtocolId::ICMPV6 },
    }}
};

// Destination Options
constexpr ProtocolDefinition IPV6_DSTOPT_DEFINITION = {
    .id = ProtocolId::IPV6_DSTOPT,
    .header_size_bytes = 8,
    .field_count = 2,
    .next_protocol_field_id = Ipv6ExtFields::NEXT_HEADER,
    .next_protocol_mapping_count = 3,
    .fields = {{
        { .bit_offset = 0, .bit_length = 8, .field_id = Ipv6ExtFields::NEXT_HEADER },
        { .bit_offset = 8, .bit_length = 8, .field_id = Ipv6ExtFields::LENGTH },
    }},
    .next_protocol_mappings = {{
        { .field_value = 6,  .next_protocol = ProtocolId::TCP },
        { .field_value = 17, .next_protocol = ProtocolId::UDP },
        { .field_value = 58, .next_protocol = ProtocolId::ICMPV6 },
    }}
};

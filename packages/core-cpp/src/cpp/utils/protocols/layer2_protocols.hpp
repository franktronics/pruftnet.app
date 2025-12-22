#pragma once

#include "protocol_types.hpp"

// ============================================================================
// LAYER 2 - Data Link Layer Protocol Definitions
// References: IEEE 802.3, IEEE 802.1Q, IEEE 802.1ad, RFC 826, RFC 903, etc.
// ============================================================================

// Field ID namespaces
namespace EthernetFields {
constexpr uint8_t DEST_MAC = 0;
constexpr uint8_t SRC_MAC = 1;
constexpr uint8_t ETHERTYPE = 2;
} // namespace EthernetFields

namespace ArpFields {
constexpr uint8_t HARDWARE_TYPE = 0;
constexpr uint8_t PROTOCOL_TYPE = 1;
constexpr uint8_t HARDWARE_SIZE = 2;
constexpr uint8_t PROTOCOL_SIZE = 3;
constexpr uint8_t OPCODE = 4;
constexpr uint8_t SENDER_MAC = 5;
constexpr uint8_t SENDER_IP = 6;
constexpr uint8_t TARGET_MAC = 7;
constexpr uint8_t TARGET_IP = 8;
} // namespace ArpFields

namespace RarpFields {
constexpr uint8_t HARDWARE_TYPE = 0;
constexpr uint8_t PROTOCOL_TYPE = 1;
constexpr uint8_t HARDWARE_SIZE = 2;
constexpr uint8_t PROTOCOL_SIZE = 3;
constexpr uint8_t OPCODE = 4;
constexpr uint8_t SENDER_MAC = 5;
constexpr uint8_t SENDER_IP = 6;
constexpr uint8_t TARGET_MAC = 7;
constexpr uint8_t TARGET_IP = 8;
} // namespace RarpFields

namespace VlanFields {
constexpr uint8_t PCP = 0;       // Priority Code Point (3 bits)
constexpr uint8_t DEI = 1;       // Drop Eligible Indicator (1 bit)
constexpr uint8_t VID = 2;       // VLAN Identifier (12 bits)
constexpr uint8_t ETHERTYPE = 3; // Encapsulated EtherType
} // namespace VlanFields

namespace MplsFields {
constexpr uint8_t LABEL = 0; // 20 bits
constexpr uint8_t TC = 1;    // Traffic Class (3 bits)
constexpr uint8_t S = 2;     // Bottom of Stack (1 bit)
constexpr uint8_t TTL = 3;   // Time to Live (8 bits)
} // namespace MplsFields

namespace PppoeFields {
constexpr uint8_t VERSION = 0;    // Version (4 bits)
constexpr uint8_t TYPE = 1;       // Type (4 bits)
constexpr uint8_t CODE = 2;       // Code (8 bits)
constexpr uint8_t SESSION_ID = 3; // Session ID (16 bits)
constexpr uint8_t LENGTH = 4;     // Payload Length (16 bits)
} // namespace PppoeFields

// ============================================================================
// Protocol Definitions
// ============================================================================

// ETHERNET - IEEE 802.3
constexpr ProtocolDefinition ETHERNET_DEFINITION = {
    .id = ProtocolId::ETHERNET,
    .header_size_bytes = 14,
    .field_count = 3,
    .next_protocol_field_id = EthernetFields::ETHERTYPE,
    .next_protocol_mapping_count = 14,
    .fields = {{
        {.bit_offset = 0, .bit_length = 48, .field_id = EthernetFields::DEST_MAC},
        {.bit_offset = 48, .bit_length = 48, .field_id = EthernetFields::SRC_MAC},
        {.bit_offset = 96, .bit_length = 16, .field_id = EthernetFields::ETHERTYPE},
    }},
    .next_protocol_mappings = {{
        {.field_value = 0x0800, .next_protocol = ProtocolId::IPV4},
        {.field_value = 0x86DD, .next_protocol = ProtocolId::IPV6},
        {.field_value = 0x0806, .next_protocol = ProtocolId::ARP},
        {.field_value = 0x8035, .next_protocol = ProtocolId::RARP},
        {.field_value = 0x8100, .next_protocol = ProtocolId::VLAN},
        {.field_value = 0x88A8, .next_protocol = ProtocolId::VLAN_DOUBLE},
        {.field_value = 0x8847, .next_protocol = ProtocolId::MPLS},
        {.field_value = 0x8848, .next_protocol = ProtocolId::MPLS},
        {.field_value = 0x8863, .next_protocol = ProtocolId::PPPOE_DISCOVERY},
        {.field_value = 0x8864, .next_protocol = ProtocolId::PPPOE_SESSION},
        {.field_value = 0x88CC, .next_protocol = ProtocolId::LLDP},
        {.field_value = 0x88E5, .next_protocol = ProtocolId::MACSEC},
        {.field_value = 0x88F7, .next_protocol = ProtocolId::PTP},
        {.field_value = 0x880B, .next_protocol = ProtocolId::PPP},
    }}};

// ARP - RFC 826
constexpr ProtocolDefinition ARP_DEFINITION = {
    .id = ProtocolId::ARP,
    .header_size_bytes = 28,
    .field_count = 9,
    .next_protocol_field_id = 255,
    .next_protocol_mapping_count = 0,
    .fields = {{
        {.bit_offset = 0, .bit_length = 16, .field_id = ArpFields::HARDWARE_TYPE},
        {.bit_offset = 16, .bit_length = 16, .field_id = ArpFields::PROTOCOL_TYPE},
        {.bit_offset = 32, .bit_length = 8, .field_id = ArpFields::HARDWARE_SIZE},
        {.bit_offset = 40, .bit_length = 8, .field_id = ArpFields::PROTOCOL_SIZE},
        {.bit_offset = 48, .bit_length = 16, .field_id = ArpFields::OPCODE},
        {.bit_offset = 64, .bit_length = 48, .field_id = ArpFields::SENDER_MAC},
        {.bit_offset = 112, .bit_length = 32, .field_id = ArpFields::SENDER_IP},
        {.bit_offset = 144, .bit_length = 48, .field_id = ArpFields::TARGET_MAC},
        {.bit_offset = 192, .bit_length = 32, .field_id = ArpFields::TARGET_IP},
    }},
    .next_protocol_mappings = {{}}};

// RARP - RFC 903
constexpr ProtocolDefinition RARP_DEFINITION = {
    .id = ProtocolId::RARP,
    .header_size_bytes = 28,
    .field_count = 9,
    .next_protocol_field_id = 255,
    .next_protocol_mapping_count = 0,
    .fields = {{
        {.bit_offset = 0, .bit_length = 16, .field_id = RarpFields::HARDWARE_TYPE},
        {.bit_offset = 16, .bit_length = 16, .field_id = RarpFields::PROTOCOL_TYPE},
        {.bit_offset = 32, .bit_length = 8, .field_id = RarpFields::HARDWARE_SIZE},
        {.bit_offset = 40, .bit_length = 8, .field_id = RarpFields::PROTOCOL_SIZE},
        {.bit_offset = 48, .bit_length = 16, .field_id = RarpFields::OPCODE},
        {.bit_offset = 64, .bit_length = 48, .field_id = RarpFields::SENDER_MAC},
        {.bit_offset = 112, .bit_length = 32, .field_id = RarpFields::SENDER_IP},
        {.bit_offset = 144, .bit_length = 48, .field_id = RarpFields::TARGET_MAC},
        {.bit_offset = 192, .bit_length = 32, .field_id = RarpFields::TARGET_IP},
    }},
    .next_protocol_mappings = {{}}};

// VLAN - IEEE 802.1Q (C-Tag)
constexpr ProtocolDefinition VLAN_DEFINITION = {
    .id = ProtocolId::VLAN,
    .header_size_bytes = 4,
    .field_count = 4,
    .next_protocol_field_id = VlanFields::ETHERTYPE,
    .next_protocol_mapping_count = 4,
    .fields = {{
        {.bit_offset = 0, .bit_length = 3, .field_id = VlanFields::PCP},
        {.bit_offset = 3, .bit_length = 1, .field_id = VlanFields::DEI},
        {.bit_offset = 4, .bit_length = 12, .field_id = VlanFields::VID},
        {.bit_offset = 16, .bit_length = 16, .field_id = VlanFields::ETHERTYPE},
    }},
    .next_protocol_mappings = {{
        {.field_value = 0x0800, .next_protocol = ProtocolId::IPV4},
        {.field_value = 0x86DD, .next_protocol = ProtocolId::IPV6},
        {.field_value = 0x0806, .next_protocol = ProtocolId::ARP},
        {.field_value = 0x8100, .next_protocol = ProtocolId::VLAN}, // QinQ inner tag
    }}};

// VLAN_DOUBLE - IEEE 802.1ad (S-Tag / QinQ outer tag)
constexpr ProtocolDefinition VLAN_DOUBLE_DEFINITION = {
    .id = ProtocolId::VLAN_DOUBLE,
    .header_size_bytes = 4,
    .field_count = 4,
    .next_protocol_field_id = VlanFields::ETHERTYPE,
    .next_protocol_mapping_count = 2,
    .fields = {{
        {.bit_offset = 0, .bit_length = 3, .field_id = VlanFields::PCP},
        {.bit_offset = 3, .bit_length = 1, .field_id = VlanFields::DEI},
        {.bit_offset = 4, .bit_length = 12, .field_id = VlanFields::VID},
        {.bit_offset = 16, .bit_length = 16, .field_id = VlanFields::ETHERTYPE},
    }},
    .next_protocol_mappings = {{
        {.field_value = 0x8100, .next_protocol = ProtocolId::VLAN}, // Inner C-Tag
        {.field_value = 0x0800, .next_protocol = ProtocolId::IPV4}, // Direct payload
    }}};

// MPLS - RFC 3031, RFC 5332
constexpr ProtocolDefinition MPLS_DEFINITION = {
    .id = ProtocolId::MPLS,
    .header_size_bytes = 4,
    .field_count = 4,
    .next_protocol_field_id = 255,    // Next protocol determined by bottom-of-stack
    .next_protocol_mapping_count = 0, // Complex: need to check S bit and guess IP version
    .fields = {{
        {.bit_offset = 0, .bit_length = 20, .field_id = MplsFields::LABEL},
        {.bit_offset = 20, .bit_length = 3, .field_id = MplsFields::TC},
        {.bit_offset = 23, .bit_length = 1, .field_id = MplsFields::S},
        {.bit_offset = 24, .bit_length = 8, .field_id = MplsFields::TTL},
    }},
    .next_protocol_mappings = {{}}};

// PPPoE Discovery - RFC 2516
constexpr ProtocolDefinition PPPOE_DISCOVERY_DEFINITION = {
    .id = ProtocolId::PPPOE_DISCOVERY,
    .header_size_bytes = 6,
    .field_count = 5,
    .next_protocol_field_id = 255, // Terminal
    .next_protocol_mapping_count = 0,
    .fields = {{
        {.bit_offset = 0, .bit_length = 4, .field_id = PppoeFields::VERSION},
        {.bit_offset = 4, .bit_length = 4, .field_id = PppoeFields::TYPE},
        {.bit_offset = 8, .bit_length = 8, .field_id = PppoeFields::CODE},
        {.bit_offset = 16, .bit_length = 16, .field_id = PppoeFields::SESSION_ID},
        {.bit_offset = 32, .bit_length = 16, .field_id = PppoeFields::LENGTH},
    }},
    .next_protocol_mappings = {{}}};

// PPPoE Session - RFC 2516
constexpr ProtocolDefinition PPPOE_SESSION_DEFINITION = {
    .id = ProtocolId::PPPOE_SESSION,
    .header_size_bytes = 6,
    .field_count = 5,
    .next_protocol_field_id = 255, // Followed by PPP payload
    .next_protocol_mapping_count = 0,
    .fields = {{
        {.bit_offset = 0, .bit_length = 4, .field_id = PppoeFields::VERSION},
        {.bit_offset = 4, .bit_length = 4, .field_id = PppoeFields::TYPE},
        {.bit_offset = 8, .bit_length = 8, .field_id = PppoeFields::CODE},
        {.bit_offset = 16, .bit_length = 16, .field_id = PppoeFields::SESSION_ID},
        {.bit_offset = 32, .bit_length = 16, .field_id = PppoeFields::LENGTH},
    }},
    .next_protocol_mappings = {{}}};

// Note: LLDP, MACsec, PTP, and PPP are complex protocols
// that require more sophisticated parsing beyond simple field extraction.
// These are placeholders for future implementation.

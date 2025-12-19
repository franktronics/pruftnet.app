#pragma once

#include "protocol_types.hpp"

namespace EthernetFields {
    constexpr uint8_t DEST_MAC = 0;
    constexpr uint8_t SRC_MAC = 1;
    constexpr uint8_t ETHERTYPE = 2;
}

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
}

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

namespace TcpFields {
    constexpr uint8_t SRC_PORT = 0;
    constexpr uint8_t DEST_PORT = 1;
    constexpr uint8_t SEQUENCE_NUMBER = 2;
    constexpr uint8_t ACK_NUMBER = 3;
    constexpr uint8_t DATA_OFFSET = 4;
    constexpr uint8_t RESERVED = 5;
    constexpr uint8_t FLAGS = 6;
    constexpr uint8_t WINDOW_SIZE = 7;
    constexpr uint8_t CHECKSUM = 8;
    constexpr uint8_t URGENT_POINTER = 9;
}

namespace UdpFields {
    constexpr uint8_t SRC_PORT = 0;
    constexpr uint8_t DEST_PORT = 1;
    constexpr uint8_t LENGTH = 2;
    constexpr uint8_t CHECKSUM = 3;
}

constexpr ProtocolDefinition ETHERNET_DEFINITION = {
    .id = ProtocolId::ETHERNET,
    .header_size_bytes = 14,
    .field_count = 3,
    .next_protocol_field_id = EthernetFields::ETHERTYPE,
    .fields = {{
        { .bit_offset = 0,   .bit_length = 48, .field_id = EthernetFields::DEST_MAC },
        { .bit_offset = 48,  .bit_length = 48, .field_id = EthernetFields::SRC_MAC },
        { .bit_offset = 96,  .bit_length = 16, .field_id = EthernetFields::ETHERTYPE },
    }}
};

constexpr ProtocolDefinition ARP_DEFINITION = {
    .id = ProtocolId::ARP,
    .header_size_bytes = 28,
    .field_count = 9,
    .next_protocol_field_id = 255,
    .fields = {{
        { .bit_offset = 0,   .bit_length = 16, .field_id = ArpFields::HARDWARE_TYPE },
        { .bit_offset = 16,  .bit_length = 16, .field_id = ArpFields::PROTOCOL_TYPE },
        { .bit_offset = 32,  .bit_length = 8,  .field_id = ArpFields::HARDWARE_SIZE },
        { .bit_offset = 40,  .bit_length = 8,  .field_id = ArpFields::PROTOCOL_SIZE },
        { .bit_offset = 48,  .bit_length = 16, .field_id = ArpFields::OPCODE },
        { .bit_offset = 64,  .bit_length = 48, .field_id = ArpFields::SENDER_MAC },
        { .bit_offset = 112, .bit_length = 32, .field_id = ArpFields::SENDER_IP },
        { .bit_offset = 144, .bit_length = 48, .field_id = ArpFields::TARGET_MAC },
        { .bit_offset = 192, .bit_length = 32, .field_id = ArpFields::TARGET_IP },
    }}
};

constexpr ProtocolDefinition IPV4_DEFINITION = {
    .id = ProtocolId::IPV4,
    .header_size_bytes = 20,
    .field_count = 13,
    .next_protocol_field_id = Ipv4Fields::PROTOCOL,
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
    }}
};

constexpr ProtocolDefinition IPV6_DEFINITION = {
    .id = ProtocolId::IPV6,
    .header_size_bytes = 40,
    .field_count = 8,
    .next_protocol_field_id = Ipv6Fields::NEXT_HEADER,
    .fields = {{
        { .bit_offset = 0,   .bit_length = 4,   .field_id = Ipv6Fields::VERSION },
        { .bit_offset = 4,   .bit_length = 8,   .field_id = Ipv6Fields::TRAFFIC_CLASS },
        { .bit_offset = 12,  .bit_length = 20,  .field_id = Ipv6Fields::FLOW_LABEL },
        { .bit_offset = 32,  .bit_length = 16,  .field_id = Ipv6Fields::PAYLOAD_LENGTH },
        { .bit_offset = 48,  .bit_length = 8,   .field_id = Ipv6Fields::NEXT_HEADER },
        { .bit_offset = 56,  .bit_length = 8,   .field_id = Ipv6Fields::HOP_LIMIT },
        { .bit_offset = 64,  .bit_length = 128, .field_id = Ipv6Fields::SRC_IP },
        { .bit_offset = 192, .bit_length = 128, .field_id = Ipv6Fields::DEST_IP },
    }}
};

constexpr ProtocolDefinition TCP_DEFINITION = {
    .id = ProtocolId::TCP,
    .header_size_bytes = 20,
    .field_count = 10,
    .next_protocol_field_id = 255,
    .fields = {{
        { .bit_offset = 0,   .bit_length = 16, .field_id = TcpFields::SRC_PORT },
        { .bit_offset = 16,  .bit_length = 16, .field_id = TcpFields::DEST_PORT },
        { .bit_offset = 32,  .bit_length = 32, .field_id = TcpFields::SEQUENCE_NUMBER },
        { .bit_offset = 64,  .bit_length = 32, .field_id = TcpFields::ACK_NUMBER },
        { .bit_offset = 96,  .bit_length = 4,  .field_id = TcpFields::DATA_OFFSET },
        { .bit_offset = 100, .bit_length = 3,  .field_id = TcpFields::RESERVED },
        { .bit_offset = 103, .bit_length = 9,  .field_id = TcpFields::FLAGS },
        { .bit_offset = 112, .bit_length = 16, .field_id = TcpFields::WINDOW_SIZE },
        { .bit_offset = 128, .bit_length = 16, .field_id = TcpFields::CHECKSUM },
        { .bit_offset = 144, .bit_length = 16, .field_id = TcpFields::URGENT_POINTER },
    }}
};

constexpr ProtocolDefinition UDP_DEFINITION = {
    .id = ProtocolId::UDP,
    .header_size_bytes = 8,
    .field_count = 4,
    .next_protocol_field_id = 255,
    .fields = {{
        { .bit_offset = 0,  .bit_length = 16, .field_id = UdpFields::SRC_PORT },
        { .bit_offset = 16, .bit_length = 16, .field_id = UdpFields::DEST_PORT },
        { .bit_offset = 32, .bit_length = 16, .field_id = UdpFields::LENGTH },
        { .bit_offset = 48, .bit_length = 16, .field_id = UdpFields::CHECKSUM },
    }}
};

inline const ProtocolDefinition* getProtocolDefinition(ProtocolId id) {
    switch (id) {
        case ProtocolId::ETHERNET: return &ETHERNET_DEFINITION;
        case ProtocolId::ARP:      return &ARP_DEFINITION;
        case ProtocolId::IPV4:     return &IPV4_DEFINITION;
        case ProtocolId::IPV6:     return &IPV6_DEFINITION;
        case ProtocolId::TCP:      return &TCP_DEFINITION;
        case ProtocolId::UDP:      return &UDP_DEFINITION;
        default:                   return nullptr;
    }
}

inline ProtocolId getNextProtocolFromEthertype(uint16_t ethertype) {
    switch (ethertype) {
        case 0x0800: return ProtocolId::IPV4;
        case 0x86DD: return ProtocolId::IPV6;
        case 0x0806: return ProtocolId::ARP;
        default:     return ProtocolId::UNKNOWN;
    }
}

inline ProtocolId getNextProtocolFromIpProtocol(uint8_t protocol) {
    switch (protocol) {
        case 0x06: return ProtocolId::TCP;
        case 0x11: return ProtocolId::UDP;
        case 0x01: return ProtocolId::ICMP;
        case 0x3A: return ProtocolId::ICMPV6;
        default:   return ProtocolId::UNKNOWN;
    }
}

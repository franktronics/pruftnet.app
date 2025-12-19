#pragma once

#include <array>
#include <cstdint>

enum class ProtocolId : uint8_t {
    ETHERNET = 0,
    ARP = 1,
    IPV4 = 2,
    IPV6 = 3,
    TCP = 4,
    UDP = 5,
    ICMP = 6,
    ICMPV6 = 7,
    UNKNOWN = 255
};

struct FieldDefinition {
    uint16_t bit_offset;
    uint16_t bit_length;
    uint8_t field_id;
};

/**
 * Mapping from a field value to the next protocol
 * Example: EtherType 0x0800 -> IPV4
 */
struct NextProtocolMapping {
    uint32_t field_value;
    ProtocolId next_protocol;
};

constexpr size_t MAX_FIELDS_PER_PROTOCOL = 16;
constexpr size_t MAX_NEXT_PROTOCOL_MAPPINGS = 16;
constexpr size_t MAX_PROTOCOLS_PER_PACKET = 8;

struct ProtocolDefinition {
    ProtocolId id;
    uint8_t header_size_bytes;
    uint8_t field_count;
    uint8_t next_protocol_field_id;  // 255 = no next protocol (terminal)
    uint8_t next_protocol_mapping_count;
    std::array<FieldDefinition, MAX_FIELDS_PER_PROTOCOL> fields;
    std::array<NextProtocolMapping, MAX_NEXT_PROTOCOL_MAPPINGS> next_protocol_mappings;
};

struct FieldEntry {
    uint16_t byte_offset;
    uint8_t byte_length;
    uint8_t field_id;
};

struct ProtocolEntry {
    ProtocolId protocol_id;
    uint16_t header_offset;
    uint8_t field_count;
    std::array<FieldEntry, MAX_FIELDS_PER_PROTOCOL> fields;
};

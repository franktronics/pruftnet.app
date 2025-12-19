#pragma once

#include "protocol_types.hpp"

// ============================================================================
// LAYER 4 - Transport Layer Protocol Definitions
// References: RFC 9293 (TCP), RFC 768 (UDP), RFC 9260 (SCTP), RFC 4340 (DCCP), RFC 3828 (UDP-Lite)
// ============================================================================

// Field ID namespaces
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

namespace SctpFields {
    constexpr uint8_t SRC_PORT = 0;
    constexpr uint8_t DEST_PORT = 1;
    constexpr uint8_t VERIFICATION_TAG = 2;
    constexpr uint8_t CHECKSUM = 3;
}

namespace DccpFields {
    constexpr uint8_t SRC_PORT = 0;
    constexpr uint8_t DEST_PORT = 1;
    constexpr uint8_t DATA_OFFSET = 2;
    constexpr uint8_t CCVAL = 3;
    constexpr uint8_t CSCOV = 4;
    constexpr uint8_t CHECKSUM = 5;
}

namespace UdpLiteFields {
    constexpr uint8_t SRC_PORT = 0;
    constexpr uint8_t DEST_PORT = 1;
    constexpr uint8_t CHECKSUM_COVERAGE = 2;
    constexpr uint8_t CHECKSUM = 3;
}

// ============================================================================
// Protocol Definitions
// ============================================================================

// TCP - RFC 9293
constexpr ProtocolDefinition TCP_DEFINITION = {
    .id = ProtocolId::TCP,
    .header_size_bytes = 20,
    .field_count = 10,
    .next_protocol_field_id = 255,  // Application layer protocols identified by port
    .next_protocol_mapping_count = 0,
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
    }},
    .next_protocol_mappings = {{}}
};

// UDP - RFC 768
constexpr ProtocolDefinition UDP_DEFINITION = {
    .id = ProtocolId::UDP,
    .header_size_bytes = 8,
    .field_count = 4,
    .next_protocol_field_id = 255,  // Application layer protocols identified by port
    .next_protocol_mapping_count = 0,
    .fields = {{
        { .bit_offset = 0,  .bit_length = 16, .field_id = UdpFields::SRC_PORT },
        { .bit_offset = 16, .bit_length = 16, .field_id = UdpFields::DEST_PORT },
        { .bit_offset = 32, .bit_length = 16, .field_id = UdpFields::LENGTH },
        { .bit_offset = 48, .bit_length = 16, .field_id = UdpFields::CHECKSUM },
    }},
    .next_protocol_mappings = {{}}
};

// SCTP - RFC 9260
constexpr ProtocolDefinition SCTP_DEFINITION = {
    .id = ProtocolId::SCTP,
    .header_size_bytes = 12,
    .field_count = 4,
    .next_protocol_field_id = 255,  // Followed by chunks
    .next_protocol_mapping_count = 0,
    .fields = {{
        { .bit_offset = 0,  .bit_length = 16, .field_id = SctpFields::SRC_PORT },
        { .bit_offset = 16, .bit_length = 16, .field_id = SctpFields::DEST_PORT },
        { .bit_offset = 32, .bit_length = 32, .field_id = SctpFields::VERIFICATION_TAG },
        { .bit_offset = 64, .bit_length = 32, .field_id = SctpFields::CHECKSUM },
    }},
    .next_protocol_mappings = {{}}
};

// DCCP - RFC 4340
constexpr ProtocolDefinition DCCP_DEFINITION = {
    .id = ProtocolId::DCCP,
    .header_size_bytes = 12,  // Generic header minimum
    .field_count = 6,
    .next_protocol_field_id = 255,
    .next_protocol_mapping_count = 0,
    .fields = {{
        { .bit_offset = 0,  .bit_length = 16, .field_id = DccpFields::SRC_PORT },
        { .bit_offset = 16, .bit_length = 16, .field_id = DccpFields::DEST_PORT },
        { .bit_offset = 32, .bit_length = 8,  .field_id = DccpFields::DATA_OFFSET },
        { .bit_offset = 40, .bit_length = 4,  .field_id = DccpFields::CCVAL },
        { .bit_offset = 44, .bit_length = 4,  .field_id = DccpFields::CSCOV },
        { .bit_offset = 48, .bit_length = 16, .field_id = DccpFields::CHECKSUM },
    }},
    .next_protocol_mappings = {{}}
};

// UDP-Lite - RFC 3828
constexpr ProtocolDefinition UDPLITE_DEFINITION = {
    .id = ProtocolId::UDPLITE,
    .header_size_bytes = 8,
    .field_count = 4,
    .next_protocol_field_id = 255,
    .next_protocol_mapping_count = 0,
    .fields = {{
        { .bit_offset = 0,  .bit_length = 16, .field_id = UdpLiteFields::SRC_PORT },
        { .bit_offset = 16, .bit_length = 16, .field_id = UdpLiteFields::DEST_PORT },
        { .bit_offset = 32, .bit_length = 16, .field_id = UdpLiteFields::CHECKSUM_COVERAGE },
        { .bit_offset = 48, .bit_length = 16, .field_id = UdpLiteFields::CHECKSUM },
    }},
    .next_protocol_mappings = {{}}
};

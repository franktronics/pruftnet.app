#include "protocol_ipv6.hpp"

ProtocolIPv6::ProtocolIPv6() {
    fields.reserve(6);
    
    fields.emplace_back(0, 4, "version_traffic_flow", "Version, Traffic Class and Flow Label");
    fields.emplace_back(4, 2, "payload_length", "Payload Length");
    fields.emplace_back(6, 1, "next_header", "Next Header");
    fields.emplace_back(7, 1, "hop_limit", "Hop Limit");
    fields.emplace_back(8, 16, "src_ip", "Source Address");
    fields.emplace_back(24, 16, "dest_ip", "Destination Address");
}

const std::vector<Field>& ProtocolIPv6::getFields() const {
    return fields;
}

void ProtocolIPv6::parsePacket(const std::array<uint8_t, MAX_PACKET_SIZE>& raw_data) {
    for (Field& field : fields) {
        field.calculateValue(raw_data);
    }
}

ProtocolType ProtocolIPv6::getProtocolType() const {
    return ProtocolType::IPV6;
}

ProtocolType ProtocolIPv6::getNextProtocol() const {
    if (fields.size() > NEXT_HEADER && !fields[NEXT_HEADER].value.empty()) {
        uint8_t next_header = fields[NEXT_HEADER].value[0];
        
        switch (next_header) {
            case 0x06:
                return ProtocolType::TCP;
            case 0x11:
                return ProtocolType::UDP;
            case 0x3A:
                return ProtocolType::ICMP;
            default:
                return ProtocolType::UNKNOWN;
        }
    }
    
    return ProtocolType::UNKNOWN;
}
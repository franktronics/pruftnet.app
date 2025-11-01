#include "protocol_ipv4.hpp"

ProtocolIPv4::ProtocolIPv4() {
    fields.reserve(10);
    
    fields.emplace_back(0, 1, "version_ihl", "Version and Header Length");
    fields.emplace_back(1, 1, "tos", "Type of Service");
    fields.emplace_back(2, 2, "total_length", "Total Length");
    fields.emplace_back(4, 2, "identification", "Identification");
    fields.emplace_back(6, 2, "flags_fragment", "Flags and Fragment Offset");
    fields.emplace_back(8, 1, "ttl", "Time to Live");
    fields.emplace_back(9, 1, "protocol", "Protocol");
    fields.emplace_back(10, 2, "checksum", "Header Checksum");
    fields.emplace_back(12, 4, "src_ip", "Source IP Address");
    fields.emplace_back(16, 4, "dest_ip", "Destination IP Address");
}

const std::vector<Field>& ProtocolIPv4::getFields() const {
    return fields;
}

void ProtocolIPv4::parsePacket(const std::array<uint8_t, MAX_PACKET_SIZE>& raw_data) {
    for (Field& field : fields) {
        field.calculateValue(raw_data);
    }
}

ProtocolType ProtocolIPv4::getProtocolType() const {
    return ProtocolType::IPV4;
}

ProtocolType ProtocolIPv4::getNextProtocol() const {
    if (fields.size() > PROTOCOL && !fields[PROTOCOL].value.empty()) {
        uint8_t protocol = fields[PROTOCOL].value[0];
        
        switch (protocol) {
            case 0x06:
                return ProtocolType::TCP;
            case 0x11:
                return ProtocolType::UDP;
            case 0x01:
                return ProtocolType::ICMP;
            default:
                return ProtocolType::UNKNOWN;
        }
    }
    
    return ProtocolType::UNKNOWN;
}
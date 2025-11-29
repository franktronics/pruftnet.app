#include "protocol_ipv4.hpp"

ProtocolIPv4::ProtocolIPv4() {
    name = "IPv4";
    fields.reserve(12);
    
    fields.emplace_back(0, 4, "version", "IP Version");
    fields.emplace_back(4, 4, "ihl", "Internet Header Length");
    fields.emplace_back(8, 8, "tos", "Type of Service");
    fields.emplace_back(16, 16, "total_length", "Total Length");
    fields.emplace_back(32, 16, "identification", "Identification");
    fields.emplace_back(48, 3, "flags", "Flags");
    fields.emplace_back(51, 13, "fragment_offset", "Fragment Offset");
    fields.emplace_back(64, 8, "ttl", "Time to Live");
    fields.emplace_back(72, 8, "protocol", "Protocol");
    fields.emplace_back(80, 16, "checksum", "Header Checksum");
    fields.emplace_back(96, 32, "src_ip", "Source IP Address");
    fields.emplace_back(128, 32, "dest_ip", "Destination IP Address");
}

const std::vector<Field>& ProtocolIPv4::getFields() const {
    return fields;
}

const std::string& ProtocolIPv4::getName() const {
    return name;
}

size_t ProtocolIPv4::getHeaderSizeBits() const {
    return IPV4_MIN_HEADER_SIZE * 8;
}

void ProtocolIPv4::parsePacket(const std::array<uint8_t, MAX_PACKET_SIZE>& raw_data, size_t base_offset_bits) {
    for (Field& field : fields) {
        field.calculateValue(raw_data, base_offset_bits);
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
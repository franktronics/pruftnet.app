#include "protocol_ipv6.hpp"

ProtocolIPv6::ProtocolIPv6() {
    name = "IPv6";
    fields.reserve(8);
    
    fields.emplace_back(0, 4, "version", "Version");
    fields.emplace_back(4, 8, "traffic_class", "Traffic Class");
    fields.emplace_back(12, 20, "flow_label", "Flow Label");
    fields.emplace_back(32, 16, "payload_length", "Payload Length");
    fields.emplace_back(48, 8, "next_header", "Next Header");
    fields.emplace_back(56, 8, "hop_limit", "Hop Limit");
    fields.emplace_back(64, 128, "src_ip", "Source Address");
    fields.emplace_back(192, 128, "dest_ip", "Destination Address");
}

const std::vector<Field>& ProtocolIPv6::getFields() const {
    return fields;
}

const std::string& ProtocolIPv6::getName() const {
    return name;
}

size_t ProtocolIPv6::getHeaderSizeBits() const {
    return IPV6_HEADER_SIZE * 8;
}

void ProtocolIPv6::parsePacket(const std::array<uint8_t, MAX_PACKET_SIZE>& raw_data, size_t base_offset_bits) {
    for (Field& field : fields) {
        field.calculateValue(raw_data, base_offset_bits);
    }
}

ProtocolType ProtocolIPv6::getProtocolType() const {
    return ProtocolType::IPV6;
}

ProtocolType ProtocolIPv6::getNextProtocol() const {
    if (fields.size() > NEXT_HEADER && !fields[NEXT_HEADER].value.empty()) {
        uint8_t next_header = fields[NEXT_HEADER].value[0];
        
        switch (next_header) {
            case 6:
                return ProtocolType::TCP;
            case 17:
                return ProtocolType::UDP;
            case 58:
                return ProtocolType::ICMPV6;
            default:
                return ProtocolType::UNKNOWN;
        }
    }
    
    return ProtocolType::UNKNOWN;
}
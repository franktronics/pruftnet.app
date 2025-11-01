#include "protocol_arp.hpp"

ProtocolARP::ProtocolARP() {
    fields.reserve(9);
    
    fields.emplace_back(0, 2, "hardware_type", "Hardware Type");
    fields.emplace_back(2, 2, "protocol_type", "Protocol Type");
    fields.emplace_back(4, 1, "hardware_size", "Hardware Address Length");
    fields.emplace_back(5, 1, "protocol_size", "Protocol Address Length");
    fields.emplace_back(6, 2, "opcode", "Operation Code");
    fields.emplace_back(8, 6, "sender_mac", "Sender Hardware Address");
    fields.emplace_back(14, 4, "sender_ip", "Sender Protocol Address");
    fields.emplace_back(18, 6, "target_mac", "Target Hardware Address");
    fields.emplace_back(24, 4, "target_ip", "Target Protocol Address");
}

const std::vector<Field>& ProtocolARP::getFields() const {
    return fields;
}

void ProtocolARP::parsePacket(const std::array<uint8_t, MAX_PACKET_SIZE>& raw_data) {
    for (Field& field : fields) {
        field.calculateValue(raw_data);
    }
}

ProtocolType ProtocolARP::getProtocolType() const {
    return ProtocolType::ARP;
}

ProtocolType ProtocolARP::getNextProtocol() const {
    return ProtocolType::UNKNOWN;
}
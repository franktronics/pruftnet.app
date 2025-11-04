#include "protocol_arp.hpp"

ProtocolARP::ProtocolARP() {
    name = "ARP";
    fields.reserve(9);
    
    fields.emplace_back(0, 16, "hardware_type", "Hardware Type");
    fields.emplace_back(16, 16, "protocol_type", "Protocol Type");
    fields.emplace_back(32, 8, "hardware_size", "Hardware Address Length");
    fields.emplace_back(40, 8, "protocol_size", "Protocol Address Length");
    fields.emplace_back(48, 16, "opcode", "Operation Code");
    fields.emplace_back(64, 48, "sender_mac", "Sender Hardware Address");
    fields.emplace_back(112, 32, "sender_ip", "Sender Protocol Address");
    fields.emplace_back(144, 48, "target_mac", "Target Hardware Address");
    fields.emplace_back(192, 32, "target_ip", "Target Protocol Address");
}

const std::vector<Field>& ProtocolARP::getFields() const {
    return fields;
}

const std::string& ProtocolARP::getName() const {
    return name;
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
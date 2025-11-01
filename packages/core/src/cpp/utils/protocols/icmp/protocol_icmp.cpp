#include "protocol_icmp.hpp"

ProtocolICMP::ProtocolICMP() {
    fields.reserve(4);
    
    fields.emplace_back(0, 1, "type", "Type");
    fields.emplace_back(1, 1, "code", "Code");
    fields.emplace_back(2, 2, "checksum", "Checksum");
    fields.emplace_back(4, 4, "rest_of_header", "Rest of Header");
}

const std::vector<Field>& ProtocolICMP::getFields() const {
    return fields;
}

void ProtocolICMP::parsePacket(const std::array<uint8_t, MAX_PACKET_SIZE>& raw_data) {
    for (Field& field : fields) {
        field.calculateValue(raw_data);
    }
}

ProtocolType ProtocolICMP::getProtocolType() const {
    return ProtocolType::ICMP;
}

ProtocolType ProtocolICMP::getNextProtocol() const {
    return ProtocolType::UNKNOWN;
}
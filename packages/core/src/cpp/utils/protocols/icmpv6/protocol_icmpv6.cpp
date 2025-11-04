#include "protocol_icmpv6.hpp"

ProtocolICMPv6::ProtocolICMPv6() {
    fields.reserve(4);
    
    fields.emplace_back(0, 8, "type", "Type");
    fields.emplace_back(8, 8, "code", "Code");
    fields.emplace_back(16, 16, "checksum", "Checksum");
    fields.emplace_back(32, 32, "rest_of_header", "Rest of Header");
}

const std::vector<Field>& ProtocolICMPv6::getFields() const {
    return fields;
}

const std::string& ProtocolICMPv6::getName() const {
    return name;
}

void ProtocolICMPv6::parsePacket(const std::array<uint8_t, MAX_PACKET_SIZE>& raw_data) {
    for (Field& field : fields) {
        field.calculateValue(raw_data);
    }
}

ProtocolType ProtocolICMPv6::getProtocolType() const {
    return ProtocolType::ICMPV6;
}

ProtocolType ProtocolICMPv6::getNextProtocol() const {
    return ProtocolType::UNKNOWN;
}
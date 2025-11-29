#include "protocol_icmp.hpp"

ProtocolICMP::ProtocolICMP() {
    name = "ICMP";
    fields.reserve(4);
    
    fields.emplace_back(0, 8, "type", "Type");
    fields.emplace_back(8, 8, "code", "Code");
    fields.emplace_back(16, 16, "checksum", "Checksum");
    fields.emplace_back(32, 32, "rest_of_header", "Rest of Header");
}

const std::vector<Field>& ProtocolICMP::getFields() const {
    return fields;
}

const std::string& ProtocolICMP::getName() const {
    return name;
}

size_t ProtocolICMP::getHeaderSizeBits() const {
    return ICMP_HEADER_SIZE * 8;
}

void ProtocolICMP::parsePacket(const std::array<uint8_t, MAX_PACKET_SIZE>& raw_data, size_t base_offset_bits) {
    for (Field& field : fields) {
        field.calculateValue(raw_data, base_offset_bits);
    }
}

ProtocolType ProtocolICMP::getProtocolType() const {
    return ProtocolType::ICMP;
}

ProtocolType ProtocolICMP::getNextProtocol() const {
    return ProtocolType::UNKNOWN;
}
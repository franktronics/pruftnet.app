#include "protocol_udp.hpp"

ProtocolUDP::ProtocolUDP() {
    fields.reserve(4);
    
    fields.emplace_back(0, 16, "src_port", "Source Port");
    fields.emplace_back(16, 16, "dest_port", "Destination Port");
    fields.emplace_back(32, 16, "length", "Length");
    fields.emplace_back(48, 16, "checksum", "Checksum");
}

const std::vector<Field>& ProtocolUDP::getFields() const {
    return fields;
}

void ProtocolUDP::parsePacket(const std::array<uint8_t, MAX_PACKET_SIZE>& raw_data) {
    for (Field& field : fields) {
        field.calculateValue(raw_data);
    }
}

ProtocolType ProtocolUDP::getProtocolType() const {
    return ProtocolType::UDP;
}

ProtocolType ProtocolUDP::getNextProtocol() const {
    return ProtocolType::UNKNOWN;
}
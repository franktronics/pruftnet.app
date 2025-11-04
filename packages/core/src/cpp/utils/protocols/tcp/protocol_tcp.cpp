#include "protocol_tcp.hpp"

ProtocolTCP::ProtocolTCP() {
    name = "TCP";
    fields.reserve(10);
    
    fields.emplace_back(0, 16, "src_port", "Source Port");
    fields.emplace_back(16, 16, "dest_port", "Destination Port");
    fields.emplace_back(32, 32, "sequence_number", "Sequence Number");
    fields.emplace_back(64, 32, "ack_number", "Acknowledgment Number");
    fields.emplace_back(96, 4, "data_offset", "Data Offset");
    fields.emplace_back(100, 3, "reserved", "Reserved");
    fields.emplace_back(103, 9, "flags", "Control Flags");
    fields.emplace_back(112, 16, "window_size", "Window Size");
    fields.emplace_back(128, 16, "checksum", "Checksum");
    fields.emplace_back(144, 16, "urgent_pointer", "Urgent Pointer");
}

const std::vector<Field>& ProtocolTCP::getFields() const {
    return fields;
}

const std::string& ProtocolTCP::getName() const {
    return name;
}

void ProtocolTCP::parsePacket(const std::array<uint8_t, MAX_PACKET_SIZE>& raw_data) {
    for (Field& field : fields) {
        field.calculateValue(raw_data);
    }
}

ProtocolType ProtocolTCP::getProtocolType() const {
    return ProtocolType::TCP;
}

ProtocolType ProtocolTCP::getNextProtocol() const {
    return ProtocolType::UNKNOWN;
}
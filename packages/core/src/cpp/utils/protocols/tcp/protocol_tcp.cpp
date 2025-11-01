#include "protocol_tcp.hpp"

ProtocolTCP::ProtocolTCP() {
    fields.reserve(8);
    
    fields.emplace_back(0, 2, "src_port", "Source Port");
    fields.emplace_back(2, 2, "dest_port", "Destination Port");
    fields.emplace_back(4, 4, "sequence_number", "Sequence Number");
    fields.emplace_back(8, 4, "ack_number", "Acknowledgment Number");
    fields.emplace_back(12, 2, "data_offset_flags", "Data Offset and Flags");
    fields.emplace_back(14, 2, "window_size", "Window Size");
    fields.emplace_back(16, 2, "checksum", "Checksum");
    fields.emplace_back(18, 2, "urgent_pointer", "Urgent Pointer");
}

const std::vector<Field>& ProtocolTCP::getFields() const {
    return fields;
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
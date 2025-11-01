#pragma once

#include "../protocol_model.hpp"

class ProtocolTCP : public ProtocolModel {
private:
    std::vector<Field> fields;

public:
    ProtocolTCP();
    const std::vector<Field>& getFields() const override;
    void parsePacket(const std::array<uint8_t, MAX_PACKET_SIZE>& raw_data) override;
    ProtocolType getProtocolType() const override;
    ProtocolType getNextProtocol() const override;
    
    static constexpr size_t TCP_MIN_HEADER_SIZE = 20;
    
    enum FieldIndex {
        SRC_PORT = 0,
        DEST_PORT = 1,
        SEQUENCE_NUMBER = 2,
        ACK_NUMBER = 3,
        DATA_OFFSET_FLAGS = 4,
        WINDOW_SIZE = 5,
        CHECKSUM = 6,
        URGENT_POINTER = 7
    };
};
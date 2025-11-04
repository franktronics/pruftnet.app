#pragma once

#include "../protocol_model.hpp"

class ProtocolTCP : public ProtocolModel {
private:
    std::vector<Field> fields;
    std::string name;

public:
    ProtocolTCP();
    const std::vector<Field>& getFields() const override;
    const std::string& getName() const override;
    void parsePacket(const std::array<uint8_t, MAX_PACKET_SIZE>& raw_data) override;
    ProtocolType getProtocolType() const override;
    ProtocolType getNextProtocol() const override;
    
    static constexpr size_t TCP_MIN_HEADER_SIZE = 20;
    
    enum FieldIndex {
        SRC_PORT = 0,
        DEST_PORT = 1,
        SEQUENCE_NUMBER = 2,
        ACK_NUMBER = 3,
        DATA_OFFSET = 4,
        RESERVED = 5,
        FLAGS = 6,
        WINDOW_SIZE = 7,
        CHECKSUM = 8,
        URGENT_POINTER = 9
    };
};
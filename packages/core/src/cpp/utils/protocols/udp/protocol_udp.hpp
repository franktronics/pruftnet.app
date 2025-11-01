#pragma once

#include "../protocol_model.hpp"

class ProtocolUDP : public ProtocolModel {
private:
    std::vector<Field> fields;

public:
    ProtocolUDP();
    const std::vector<Field>& getFields() const override;
    void parsePacket(const std::array<uint8_t, MAX_PACKET_SIZE>& raw_data) override;
    ProtocolType getProtocolType() const override;
    ProtocolType getNextProtocol() const override;
    
    static constexpr size_t UDP_HEADER_SIZE = 8;
    
    enum FieldIndex {
        SRC_PORT = 0,
        DEST_PORT = 1,
        LENGTH = 2,
        CHECKSUM = 3
    };
};
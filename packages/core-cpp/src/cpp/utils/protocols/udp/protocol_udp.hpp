#pragma once

#include "../protocol_model.hpp"

class ProtocolUDP : public ProtocolModel {
private:
    std::vector<Field> fields;
    std::string name;

public:
    ProtocolUDP();
    const std::vector<Field>& getFields() const override;
    const std::string& getName() const override;
    size_t getHeaderSizeBits() const override;
    void parsePacket(const std::array<uint8_t, MAX_PACKET_SIZE>& raw_data, size_t base_offset_bits = 0) override;
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
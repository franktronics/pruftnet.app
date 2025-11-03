#pragma once

#include "../protocol_model.hpp"

class ProtocolIPv4 : public ProtocolModel {
private:
    std::vector<Field> fields;

public:
    ProtocolIPv4();
    const std::vector<Field>& getFields() const override;
    void parsePacket(const std::array<uint8_t, MAX_PACKET_SIZE>& raw_data) override;
    ProtocolType getProtocolType() const override;
    ProtocolType getNextProtocol() const override;
    
    static constexpr size_t IPV4_MIN_HEADER_SIZE = 20;
    static constexpr size_t IPV4_ADDRESS_SIZE = 4;
    
    enum FieldIndex {
        VERSION = 0,
        IHL = 1,
        TOS = 2,
        TOTAL_LENGTH = 3,
        IDENTIFICATION = 4,
        FLAGS = 5,
        FRAGMENT_OFFSET = 6,
        TTL = 7,
        PROTOCOL = 8,
        CHECKSUM = 9,
        SRC_IP = 10,
        DEST_IP = 11
    };
};
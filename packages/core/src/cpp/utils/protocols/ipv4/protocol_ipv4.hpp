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
        VERSION_IHL = 0,
        TOS = 1,
        TOTAL_LENGTH = 2,
        IDENTIFICATION = 3,
        FLAGS_FRAGMENT = 4,
        TTL = 5,
        PROTOCOL = 6,
        CHECKSUM = 7,
        SRC_IP = 8,
        DEST_IP = 9
    };
};
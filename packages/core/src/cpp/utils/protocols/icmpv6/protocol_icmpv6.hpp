#pragma once

#include "../protocol_model.hpp"

class ProtocolICMPv6 : public ProtocolModel {
private:
    std::vector<Field> fields;

public:
    ProtocolICMPv6();
    const std::vector<Field>& getFields() const override;
    void parsePacket(const std::array<uint8_t, MAX_PACKET_SIZE>& raw_data) override;
    ProtocolType getProtocolType() const override;
    ProtocolType getNextProtocol() const override;
    
    static constexpr size_t ICMPV6_HEADER_SIZE = 8;
    
    enum FieldIndex {
        TYPE = 0,
        CODE = 1,
        CHECKSUM = 2,
        REST_OF_HEADER = 3
    };
};
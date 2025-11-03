#pragma once

#include "../protocol_model.hpp"

class ProtocolIPv6 : public ProtocolModel {
private:
    std::vector<Field> fields;

public:
    ProtocolIPv6();
    const std::vector<Field>& getFields() const override;
    void parsePacket(const std::array<uint8_t, MAX_PACKET_SIZE>& raw_data) override;
    ProtocolType getProtocolType() const override;
    ProtocolType getNextProtocol() const override;
    
    static constexpr size_t IPV6_HEADER_SIZE = 40;
    static constexpr size_t IPV6_ADDRESS_SIZE = 16;
    
    enum FieldIndex {
        VERSION = 0,
        TRAFFIC_CLASS = 1,
        FLOW_LABEL = 2,
        PAYLOAD_LENGTH = 3,
        NEXT_HEADER = 4,
        HOP_LIMIT = 5,
        SRC_IP = 6,
        DEST_IP = 7
    };
};
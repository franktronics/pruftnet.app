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
        VERSION_TRAFFIC_FLOW = 0,
        PAYLOAD_LENGTH = 1,
        NEXT_HEADER = 2,
        HOP_LIMIT = 3,
        SRC_IP = 4,
        DEST_IP = 5
    };
};
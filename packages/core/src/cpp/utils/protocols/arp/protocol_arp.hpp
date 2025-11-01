#pragma once

#include "../protocol_model.hpp"

class ProtocolARP : public ProtocolModel {
private:
    std::vector<Field> fields;

public:
    ProtocolARP();
    const std::vector<Field>& getFields() const override;
    void parsePacket(const std::array<uint8_t, MAX_PACKET_SIZE>& raw_data) override;
    ProtocolType getProtocolType() const override;
    ProtocolType getNextProtocol() const override;
    
    static constexpr size_t ARP_HEADER_SIZE = 28;
    static constexpr size_t MAC_ADDRESS_SIZE = 6;
    static constexpr size_t IPV4_ADDRESS_SIZE = 4;
    
    enum FieldIndex {
        HARDWARE_TYPE = 0,
        PROTOCOL_TYPE = 1,
        HARDWARE_SIZE = 2,
        PROTOCOL_SIZE = 3,
        OPCODE = 4,
        SENDER_MAC = 5,
        SENDER_IP = 6,
        TARGET_MAC = 7,
        TARGET_IP = 8
    };
};
#pragma once

#include "../protocol_model.hpp"

class ProtocolEthernet : public ProtocolModel {
private:
    std::vector<Field> fields;
    std::string name;

public:
    ProtocolEthernet();
    const std::vector<Field>& getFields() const override;
    const std::string& getName() const override;
    void parsePacket(const std::array<uint8_t, MAX_PACKET_SIZE>& raw_data) override;
    ProtocolType getProtocolType() const override;
    ProtocolType getNextProtocol() const override;
    
    static constexpr size_t ETHERNET_HEADER_SIZE = 14;
    static constexpr size_t MAC_ADDRESS_SIZE = 6;
    
    enum FieldIndex {
        DEST_MAC = 0,
        SRC_MAC = 1,
        ETHERTYPE = 2
    };
};
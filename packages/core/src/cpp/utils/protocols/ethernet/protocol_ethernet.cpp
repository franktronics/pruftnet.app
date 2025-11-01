#include "protocol_ethernet.hpp"

ProtocolEthernet::ProtocolEthernet() {
    fields.reserve(3);
    
    fields.emplace_back(0, MAC_ADDRESS_SIZE, "dest_mac", 
                       "Destination MAC Address");
    
    fields.emplace_back(MAC_ADDRESS_SIZE, MAC_ADDRESS_SIZE, "src_mac",
                       "Source MAC Address");
    
    fields.emplace_back(12, 2, "ethertype",
                       "EtherType or Frame Length");
}

const std::vector<Field>& ProtocolEthernet::getFields() const {
    return fields;
}

void ProtocolEthernet::parsePacket(const std::array<uint8_t, MAX_PACKET_SIZE>& raw_data) {
    for (Field& field : fields) {
        field.calculateValue(raw_data);
    }
}

ProtocolType ProtocolEthernet::getProtocolType() const {
    return ProtocolType::ETHERNET;
}

ProtocolType ProtocolEthernet::getNextProtocol() const {
    if (fields.size() > ETHERTYPE && !fields[ETHERTYPE].value.empty() && fields[ETHERTYPE].value.size() >= 2) {
        uint16_t ethertype = (static_cast<uint16_t>(fields[ETHERTYPE].value[0]) << 8) |
                            static_cast<uint16_t>(fields[ETHERTYPE].value[1]);
        
        switch (ethertype) {
            case 0x0800:
                return ProtocolType::IPV4;
            case 0x86DD:
                return ProtocolType::IPV6;
            case 0x0806:
                return ProtocolType::ARP;
            default:
                if (ethertype <= 1500) {
                    return ProtocolType::UNKNOWN;
                }
                return ProtocolType::UNKNOWN;
        }
    }
    
    return ProtocolType::UNKNOWN;
}
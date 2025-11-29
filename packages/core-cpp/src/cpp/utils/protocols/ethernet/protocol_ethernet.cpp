#include "protocol_ethernet.hpp"

ProtocolEthernet::ProtocolEthernet() {
    name = "Ethernet";
    fields.reserve(3);
    
    // Destination MAC Address: 6 bytes = 48 bits, starting at bit 0
    fields.emplace_back(0, 48, "dest_mac", 
                       "Destination MAC Address");
    
    // Source MAC Address: 6 bytes = 48 bits, starting at bit 48
    fields.emplace_back(48, 48, "src_mac",
                       "Source MAC Address");
    
    // EtherType: 2 bytes = 16 bits, starting at bit 96
    fields.emplace_back(96, 16, "ethertype",
                       "EtherType or Frame Length");
}

const std::vector<Field>& ProtocolEthernet::getFields() const {
    return fields;
}

const std::string& ProtocolEthernet::getName() const {
    return name;
}

size_t ProtocolEthernet::getHeaderSizeBits() const {
    return ETHERNET_HEADER_SIZE * 8;
}

void ProtocolEthernet::parsePacket(const std::array<uint8_t, MAX_PACKET_SIZE>& raw_data, size_t base_offset_bits) {
    for (Field& field : fields) {
        field.calculateValue(raw_data, base_offset_bits);
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
#include "./packet_parser.hpp"

PacketParser::PacketParser() {}

PacketParser::~PacketParser() {}

std::vector<std::unique_ptr<ProtocolModel>> PacketParser::parse(const std::array<uint8_t, MAX_PACKET_SIZE>& data) {
    std::vector<std::unique_ptr<ProtocolModel>> protocols;
    
    auto current_protocol = ProtocolFactory::create(ProtocolType::ETHERNET);
    size_t current_offset_bits = 0;
    
    while (current_protocol != nullptr) {
        current_protocol->parsePacket(data, current_offset_bits);
        ProtocolType next_type = current_protocol->getNextProtocol();
        current_offset_bits += current_protocol->getHeaderSizeBits();
        protocols.push_back(std::move(current_protocol));
        
        if (next_type == ProtocolType::UNKNOWN) {
            break;
        }
        
        current_protocol = ProtocolFactory::create(next_type);
    }
    
    return protocols;
}
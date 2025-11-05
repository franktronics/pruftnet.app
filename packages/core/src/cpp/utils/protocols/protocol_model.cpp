#include "protocol_model.hpp"
#include "ethernet/protocol_ethernet.hpp"
#include "./ipv4/protocol_ipv4.hpp"
#include "./ipv6/protocol_ipv6.hpp"
#include "./arp/protocol_arp.hpp"
#include "./tcp/protocol_tcp.hpp"
#include "./udp/protocol_udp.hpp"
#include "./icmp/protocol_icmp.hpp"
#include "./icmpv6/protocol_icmpv6.hpp"
#include <cstring>

Field::Field(size_t bit_start, size_t bit_length, const std::string& name, 
             const std::string& description)
    : bit_start(bit_start), bit_length(bit_length), name(name), description(description) {}

Field::Field() : bit_start(0), bit_length(0), name(""), description("") {}

bool Field::calculateValue(const std::array<uint8_t, MAX_PACKET_SIZE>& raw_data, size_t base_offset_bits) {
    if (bit_length == 0) {
        value.clear();
        return true;
    }
    
    size_t bytes_needed = (bit_length + 7) / 8;
    value.assign(bytes_needed, 0);
    
    size_t absolute_bit_start = base_offset_bits + bit_start;
    size_t total_bits_needed = absolute_bit_start + bit_length;
    size_t total_bytes_in_packet = (total_bits_needed + 7) / 8;
    
    if (total_bytes_in_packet > MAX_PACKET_SIZE) {
        value.clear();
        return false;
    }
    
    for (size_t i = 0; i < bit_length; ++i) {
        size_t src_bit_index = absolute_bit_start + i;
        size_t src_byte_index = src_bit_index / 8;
        size_t src_bit_offset = src_bit_index % 8;
        
        size_t dest_bit_index = i;
        size_t dest_byte_index = dest_bit_index / 8;
        size_t dest_bit_offset = dest_bit_index % 8;
        
        uint8_t bit = (raw_data[src_byte_index] >> (7 - src_bit_offset)) & 1;
        
        if (bit) {
            value[dest_byte_index] |= (1 << (7 - dest_bit_offset));
        }
    }
    return true;
}

std::string Field::toString() const {
    if (value.empty() || bit_length == 0) {
        return "";
    }
    
    std::string result;
    
    // For fields 4 bits or less, extract from the MSB
    if (bit_length <= 4) {
        uint8_t extracted_value = value[0] >> (8 - bit_length);
        char buffer[3];
        std::snprintf(buffer, sizeof(buffer), "%X", extracted_value);
        return std::string(buffer);
    }
    
    // For fields between 5-12 bits, display as single hex value
    if (bit_length <= 12) {
        uint16_t combined_value = 0;
        size_t bytes_needed = (bit_length + 7) / 8;
        
        for (size_t i = 0; i < bytes_needed && i < value.size(); ++i) {
            combined_value = (combined_value << 8) | value[i];
        }
        
        // Right-shift to align the value properly
        combined_value >>= (bytes_needed * 8 - bit_length);
        
        char buffer[5];
        if (bit_length <= 8) {
            std::snprintf(buffer, sizeof(buffer), "%02X", (uint8_t)combined_value);
        } else {
            std::snprintf(buffer, sizeof(buffer), "%02X", combined_value);
        }
        return std::string(buffer);
    }
    
    // For larger fields, display each byte separated by space
    size_t bytes_needed = (bit_length + 7) / 8;
    for (size_t i = 0; i < bytes_needed && i < value.size(); ++i) {
        char buffer[4];
        std::snprintf(buffer, sizeof(buffer), "%02X", value[i]);
        if (i > 0) result += " ";
        result += buffer;
    }
    
    return result;
}

std::unique_ptr<ProtocolModel> ProtocolFactory::create(ProtocolType type) {
    switch (type) {
        case ProtocolType::ETHERNET:
            return std::make_unique<ProtocolEthernet>();
        case ProtocolType::IPV4:
            return std::make_unique<ProtocolIPv4>();
        case ProtocolType::IPV6:
            return std::make_unique<ProtocolIPv6>();
        case ProtocolType::ARP:
            return std::make_unique<ProtocolARP>();
        case ProtocolType::TCP:
            return std::make_unique<ProtocolTCP>();
        case ProtocolType::UDP:
            return std::make_unique<ProtocolUDP>();
        case ProtocolType::ICMP:
            return std::make_unique<ProtocolICMP>();
        case ProtocolType::ICMPV6:
            return std::make_unique<ProtocolICMPv6>();
        case ProtocolType::UNKNOWN:
        default:
            return nullptr;
    }
}
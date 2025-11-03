#include "protocol_model.hpp"
#include <cstring>

Field::Field(size_t bit_start, size_t bit_length, const std::string& name, 
             const std::string& description)
    : bit_start(bit_start), bit_length(bit_length), name(name), description(description) {}

Field::Field() : bit_start(0), bit_length(0), name(""), description("") {}

bool Field::calculateValue(const std::array<uint8_t, MAX_PACKET_SIZE>& raw_data) {
    if (bit_length == 0) {
        value.clear();
        return true;
    }
    
    // Calculate how many bytes we need to store the bit_length
    size_t bytes_needed = (bit_length + 7) / 8;
    value.assign(bytes_needed, 0);
    
    // Check bounds
    size_t total_bits_needed = bit_start + bit_length;
    size_t total_bytes_in_packet = (total_bits_needed + 7) / 8;
    
    if (total_bytes_in_packet > MAX_PACKET_SIZE) {
        value.clear();
        return false;
    }
    
    // Extract bits from raw_data
    for (size_t i = 0; i < bit_length; ++i) {
        size_t src_bit_index = bit_start + i;
        size_t src_byte_index = src_bit_index / 8;
        size_t src_bit_offset = src_bit_index % 8;
        
        size_t dest_bit_index = i;
        size_t dest_byte_index = dest_bit_index / 8;
        size_t dest_bit_offset = dest_bit_index % 8;
        
        // Extract bit from source
        uint8_t bit = (raw_data[src_byte_index] >> (7 - src_bit_offset)) & 1;
        
        if (bit) {
            value[dest_byte_index] |= (1 << (7 - dest_bit_offset));
        }
    }
    return true;
}
#include "protocol_model.hpp"
#include <cstring>

Field::Field(size_t offset, size_t size, const std::string& name, 
             const std::string& description)
    : offset(offset), size(size), name(name), description(description) {}

Field::Field() : offset(0), size(0), name(""), description("") {}

void Field::calculateValue(const std::array<uint8_t, MAX_PACKET_SIZE>& raw_data) {
    // Validate bounds
    if (offset + size <= MAX_PACKET_SIZE) {
        // Extract value from raw data
        value.resize(size);
        std::memcpy(value.data(), raw_data.data() + offset, size);
    } else {
        // Invalid field, set empty value
        value.clear();
    }
}
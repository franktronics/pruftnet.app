#include "packet_model.hpp"

RawPacket::RawPacket(): timestamp(std::chrono::system_clock::now()) {}

std::string RawPacket::toString() const {
    std::string result = "RawPacket(";
    result += "length=" + std::to_string(length) + ", ";
    result += "original_length=" + std::to_string(original_length) + ", ";
    result += "valid=" + std::string(valid ? "true" : "false") + ", ";
    result += "data=[";
    for (size_t i = 0; i < length && i < MAX_PACKET_SIZE; ++i) {
        if (i > 0) result += ", ";
        result += "0x" + std::to_string(static_cast<int>(data[i]));
    }
    result += "])";
    return result;
}
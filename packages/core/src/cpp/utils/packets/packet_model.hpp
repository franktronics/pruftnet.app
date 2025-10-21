#pragma once

#include <array>
#include <cstdint>
#include <cstddef>

constexpr size_t MAX_PACKET_SIZE = 1024;

struct RawPacket {
    std::array<uint8_t, MAX_PACKET_SIZE> data;
    size_t length = 0;
    bool valid = false;
};
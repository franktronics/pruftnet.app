#pragma once

#include "../../utils/common/common.hpp"
#include <array>

class PacketParser {
public:
    PacketParser();
    ~PacketParser();

    void parse(const std::array<uint8_t, MAX_PACKET_SIZE>& data);
};
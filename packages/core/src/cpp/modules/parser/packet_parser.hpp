#pragma once

#include "../../utils/common/common.hpp"
#include "../../utils/protocols/protocol_model.hpp"
#include <array>
#include <vector>
#include <memory>

class PacketParser {
public:
    PacketParser();
    ~PacketParser();

    std::vector<std::unique_ptr<ProtocolModel>> parse(const std::array<uint8_t, MAX_PACKET_SIZE>& data);
};
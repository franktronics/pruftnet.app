#pragma once

#include "pruftnet/sniffing/packet.hpp"
#include "pruftnet/sniffing/parsed_packet.hpp"

namespace pruftnet::sniffing::internal {

class PacketParser {
public:
    [[nodiscard]] ParsedPacket parse(const RawPacketView& raw_packet) const;
};

} // namespace pruftnet::sniffing::internal

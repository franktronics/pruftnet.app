#include "sniffing/empty_packet_parser.hpp"

namespace pruftnet::sniffing::internal {

ParsedPacket EmptyPacketParser::parse(const RawPacketView&) const {
    return ParsedPacket{};
}

} // namespace pruftnet::sniffing::internal

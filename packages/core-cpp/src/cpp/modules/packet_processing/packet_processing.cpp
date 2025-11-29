#include "./packet_processing.hpp"
#include "../parser/packet_parser.hpp"

PacketProcessing::PacketProcessing() {}

PacketProcessing::~PacketProcessing() = default;

void PacketProcessing::execute(const RawPacket &packet) {
  PacketParser parser;
  auto protocols = parser.parse(packet.data);
}

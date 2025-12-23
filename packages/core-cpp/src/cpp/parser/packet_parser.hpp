#pragma once

#include "../utils/packets/packet_model.hpp"
#include "./parser_model.hpp"

class PacketParser : public ParserModel {
public:
  PacketParser() = default;
  ~PacketParser() override = default;

  ParsedPacket parsePacket(const RawPacket& raw_packet) override;
};

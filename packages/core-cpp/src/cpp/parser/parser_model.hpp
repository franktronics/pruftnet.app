#pragma once
#include "../../utils/packets/packet_model.hpp"

class ParserModel {
public:
  virtual ~ParserModel() = default;
  virtual ParsedPacket parsePacket(const RawPacket& raw_packet) = 0;
};

#pragma once
#include "./parser_model.hpp"

class NetworkParser : public ParserModel {
public:
  NetworkParser() = default;
  ~NetworkParser() override = default;
  ParsedPacket parsePacket(const RawPacket &raw_packet) override;
};

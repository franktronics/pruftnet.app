#pragma once

#include "../../utils/packets/packet_model.hpp"
#include "../../utils/protocols/protocol_definitions.hpp"
#include "./parser_model.hpp"

class PacketParser : public ParserModel {
public:
  PacketParser() = default;
  ~PacketParser() override = default;

  ParsedPacket parsePacket(const RawPacket& raw_packet) override;

private:
  void parseProtocol(const RawPacket& raw_packet, ParsedPacket& parsed, ProtocolId protocol_id, size_t offset_bytes);

  ProtocolId determineNextProtocol(const RawPacket& raw_packet, const ProtocolDefinition* def,
                                   size_t header_offset_bytes);

  uint32_t extractFieldValue(const RawPacket& raw_packet, size_t header_offset_bytes, uint16_t bit_offset,
                             uint16_t bit_length);
};

#pragma once

#include "../protocol_loader/protocol_loader.hpp"
#include "../utils/packets/packet_model.hpp"
#include "./parser_model.hpp"
#include <string>
#include <unordered_map>

class PacketParser : public ParserModel {
private:
  ProtocolLoader protocol_loader_;
  std::string protocol_entry_file_;

  uint64_t extractBits(const uint8_t* data, size_t data_length, uint32_t bit_offset, uint32_t bit_length) const;
  uint32_t evaluateStartAfter(const std::string& expression,
                              const std::unordered_map<std::string, uint64_t>& field_values) const;
  std::string resolveProtocolPath(const std::string& current_path, const std::string& relative_path) const;

public:
  PacketParser() = default;
  ~PacketParser() override = default;

  ParsedPacket parsePacket(const RawPacket& raw_packet) override;
  void setProtocolEntryFile(const std::string& path) override;
};

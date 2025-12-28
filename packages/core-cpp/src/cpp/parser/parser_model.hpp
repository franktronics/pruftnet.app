#pragma once
#include "../utils/packets/packet_model.hpp"
#include <napi.h>
#include <string>
#include <unordered_map>
#include <vector>

struct ParsedProtocolLayer {
  std::string protocol_name;
  std::unordered_map<std::string, uint64_t> fields;
};

struct ParsedPacket {
  std::vector<ParsedProtocolLayer> layers;
};

class ParserModel {
public:
  virtual ~ParserModel() = default;
  virtual ParsedPacket parsePacket(const RawPacket& raw_packet) = 0;
  virtual Napi::Array toNapiArray(Napi::Env& env, const ParsedPacket& parsed) = 0;
  virtual void setProtocolsBasePath(const std::string& path) = 0;
};

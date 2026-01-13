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
  Napi::Array toNapiArray(Napi::Env& env) const {
    Napi::Array result = Napi::Array::New(env, layers.size());

    for (size_t i = 0; i < layers.size(); i++) {
      const ParsedProtocolLayer& layer = layers[i];
      Napi::Object layer_obj = Napi::Object::New(env);

      for (const auto& [key, value] : layer.fields) {
        if (value <= 0xFFFFFFFF) {
          layer_obj.Set(key, Napi::Number::New(env, static_cast<double>(value)));
        } else {
          layer_obj.Set(key, Napi::BigInt::New(env, value));
        }
      }

      layer_obj.Set("protocol_name", Napi::String::New(env, layer.protocol_name));
      result.Set(i, layer_obj);
    }

    return result;
  }
};

class ParserModel {
public:
  virtual ~ParserModel() = default;
  virtual ParsedPacket parsePacket(const RawPacket& raw_packet) = 0;
  virtual Napi::Array toNapiArray(Napi::Env& env, const ParsedPacket& parsed) = 0;
  virtual void setProtocolsBasePath(const std::string& path) = 0;
};

#pragma once

#include "../../utils/packets/packet_model.hpp"
#include "./packet_parser.hpp"
#include <cstring>
#include <memory>
#include <napi.h>

/**
 * N-API wrapper for PacketParser
 * Allows standalone parsing of raw packet data from JavaScript
 */
class PacketParserWrapper : public Napi::ObjectWrap<PacketParserWrapper> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  PacketParserWrapper(const Napi::CallbackInfo& info);

private:
  static Napi::FunctionReference constructor;

  std::unique_ptr<PacketParser> parser_;

  // JavaScript methods
  Napi::Value Parse(const Napi::CallbackInfo& info);

  // Helper to convert ParsedPacket to JS object
  static Napi::Object ParsedPacketToJs(Napi::Env env, const ParsedPacket& parsed);
};

// Implementation

Napi::FunctionReference PacketParserWrapper::constructor;

Napi::Object PacketParserWrapper::Init(Napi::Env env, Napi::Object exports) {
  Napi::HandleScope scope(env);

  Napi::Function func = DefineClass(env, "PacketParser",
                                    {
                                        InstanceMethod("parse", &PacketParserWrapper::Parse),
                                    });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  exports.Set("PacketParser", func);
  return exports;
}

PacketParserWrapper::PacketParserWrapper(const Napi::CallbackInfo& info) : Napi::ObjectWrap<PacketParserWrapper>(info) {

  parser_ = std::make_unique<PacketParser>();
}

Napi::Value PacketParserWrapper::Parse(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1) {
    Napi::TypeError::New(env, "Expected 1 argument: Buffer containing raw packet data").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  if (!info[0].IsBuffer()) {
    Napi::TypeError::New(env, "First argument must be a Buffer").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  Napi::Buffer<uint8_t> buffer = info[0].As<Napi::Buffer<uint8_t>>();

  // Create RawPacket from buffer
  RawPacket raw;
  raw.length = std::min(buffer.Length(), static_cast<size_t>(MAX_PACKET_SIZE));
  raw.original_length = buffer.Length();
  raw.valid = true;
  raw.timestamp = std::chrono::system_clock::now();
  std::memcpy(raw.data.data(), buffer.Data(), raw.length);

  // Parse the packet
  ParsedPacket parsed = parser_->parsePacket(raw);

  return ParsedPacketToJs(env, parsed);
}

Napi::Object PacketParserWrapper::ParsedPacketToJs(Napi::Env env, const ParsedPacket& parsed) {
  Napi::Object obj = Napi::Object::New(env);

  obj.Set("protocolCount", Napi::Number::New(env, parsed.protocol_count));
  obj.Set("valid", Napi::Boolean::New(env, parsed.valid));

  Napi::Array protocols = Napi::Array::New(env, parsed.protocol_count);

  for (uint8_t i = 0; i < parsed.protocol_count; ++i) {
    const ProtocolEntry& proto = parsed.protocols[i];
    Napi::Object protoObj = Napi::Object::New(env);

    protoObj.Set("protocolId", Napi::Number::New(env, static_cast<uint8_t>(proto.protocol_id)));
    protoObj.Set("headerOffset", Napi::Number::New(env, proto.header_offset));
    protoObj.Set("fieldCount", Napi::Number::New(env, proto.field_count));

    Napi::Array fields = Napi::Array::New(env, proto.field_count);

    for (uint8_t j = 0; j < proto.field_count; ++j) {
      const FieldEntry& field = proto.fields[j];
      Napi::Object fieldObj = Napi::Object::New(env);

      fieldObj.Set("byteOffset", Napi::Number::New(env, field.byte_offset));
      fieldObj.Set("byteLength", Napi::Number::New(env, field.byte_length));
      fieldObj.Set("fieldId", Napi::Number::New(env, field.field_id));

      fields.Set(j, fieldObj);
    }

    protoObj.Set("fields", fields);
    protocols.Set(i, protoObj);
  }

  obj.Set("protocols", protocols);

  return obj;
}

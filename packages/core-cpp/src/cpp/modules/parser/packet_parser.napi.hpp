#pragma once

#include <napi.h>
#include "./packet_parser.hpp"
#include <memory>

class PacketParserWrapper : public Napi::ObjectWrap<PacketParserWrapper> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  PacketParserWrapper(const Napi::CallbackInfo &info);

private:
  static Napi::FunctionReference constructor;
  
  std::unique_ptr<PacketParser> parser_;

  Napi::Value Parse(const Napi::CallbackInfo &info);
  
  static Napi::Object FieldToJS(Napi::Env env, const Field &field);
  static Napi::Object ProtocolToJS(Napi::Env env, const ProtocolModel &protocol);
};

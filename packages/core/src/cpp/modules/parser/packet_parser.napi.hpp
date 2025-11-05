#pragma once

#include <napi.h>
#include "packet_parser.hpp"

class PacketParserWrapper : public Napi::ObjectWrap<PacketParserWrapper> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    PacketParserWrapper(const Napi::CallbackInfo& info);

private:
    static Napi::FunctionReference constructor;
    
    Napi::Value Parse(const Napi::CallbackInfo& info);
    
    PacketParser* parser_;
    
    static Napi::Object ProtocolToJS(Napi::Env env, const ProtocolModel& protocol);
    static Napi::Object FieldToJS(Napi::Env env, const Field& field);
};
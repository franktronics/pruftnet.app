#ifndef PACKET_PARSER_HPP
#define PACKET_PARSER_HPP

#include <napi.h>
#include "../utils/common.hpp"

class PacketParser : public Napi::ObjectWrap<PacketParser> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    PacketParser(const Napi::CallbackInfo& info);

private:
    static Napi::FunctionReference constructor;
    
    // Methods exposed to JavaScript
    Napi::Value Parse(const Napi::CallbackInfo& info);
    Napi::Value GetTestData(const Napi::CallbackInfo& info);
    
    // Internal C++ methods
    CoreUtils::PacketData parsePacketData(const std::vector<uint8_t>& data);
};

#endif // PACKET_PARSER_HPP
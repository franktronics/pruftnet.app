#ifndef PACKET_ANALYZER_HPP
#define PACKET_ANALYZER_HPP

#include <napi.h>
#include "../utils/common.hpp"

class PacketAnalyzer : public Napi::ObjectWrap<PacketAnalyzer> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    PacketAnalyzer(const Napi::CallbackInfo& info);

private:
    static Napi::FunctionReference constructor;
    
    // Methods exposed to JavaScript
    Napi::Value Analyze(const Napi::CallbackInfo& info);
    Napi::Value GetTestData(const Napi::CallbackInfo& info);
    
    // Internal C++ methods
    CoreUtils::AnalysisResult analyzePacket(const CoreUtils::PacketData& packet);
};

#endif // PACKET_ANALYZER_HPP
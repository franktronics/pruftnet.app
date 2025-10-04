#ifndef NETWORK_SCANNER_HPP
#define NETWORK_SCANNER_HPP

#include <napi.h>
#include "../utils/common.hpp"

class NetworkScanner : public Napi::ObjectWrap<NetworkScanner> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    NetworkScanner(const Napi::CallbackInfo& info);

private:
    static Napi::FunctionReference constructor;
    
    // Methods exposed to JavaScript
    Napi::Value Scan(const Napi::CallbackInfo& info);
    Napi::Value GetTestData(const Napi::CallbackInfo& info);
    
    // Internal C++ methods
    CoreUtils::ScanResult scanTarget(const std::string& target);
};

#endif // NETWORK_SCANNER_HPP
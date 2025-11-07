#pragma once

#include <napi.h>
#include "network_sniffer.hpp"
#include "../../utils/network_interface/n_interface_model.napi.hpp"

class NetworkSnifferWrapper : public Napi::ObjectWrap<NetworkSnifferWrapper> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    NetworkSnifferWrapper(const Napi::CallbackInfo& info);

private:
    static Napi::FunctionReference constructor;
    
    Napi::Value StartSniffing(const Napi::CallbackInfo& info);
    Napi::Value StopSniffing(const Napi::CallbackInfo& info);
    Napi::Value IsRunning(const Napi::CallbackInfo& info);
    
    NetworkSniffer* sniffer_;
    Napi::ThreadSafeFunction thread_safe_callback_;
    
    static Napi::Object RawPacketToJS(Napi::Env env, const RawPacket& packet);
};
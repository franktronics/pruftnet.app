#pragma once

#include <napi.h>
#include "../../utils/network_interface/n_interface_model.hpp"

class NetworkInterfaceWrapper : public Napi::ObjectWrap<NetworkInterfaceWrapper> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    NetworkInterfaceWrapper(const Napi::CallbackInfo& info);

    NetworkInterface* GetNativeInterface() const { return interface_; }

private:
    static Napi::FunctionReference constructor;
    
    Napi::Value GetName(const Napi::CallbackInfo& info);
    void SetName(const Napi::CallbackInfo& info, const Napi::Value& value);
    
    NetworkInterface* interface_;
};
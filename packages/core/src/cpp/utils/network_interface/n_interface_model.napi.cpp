#include "n_interface_model.napi.hpp"

Napi::FunctionReference NetworkInterfaceWrapper::constructor;

Napi::Object NetworkInterfaceWrapper::Init(Napi::Env env, Napi::Object exports) {
    Napi::HandleScope scope(env);

    Napi::Function func = DefineClass(env, "NetworkInterface", {
        InstanceAccessor("name", &NetworkInterfaceWrapper::GetName, &NetworkInterfaceWrapper::SetName)
    });

    constructor = Napi::Persistent(func);
    constructor.SuppressDestruct();

    exports.Set("NetworkInterface", func);
    return exports;
}

NetworkInterfaceWrapper::NetworkInterfaceWrapper(const Napi::CallbackInfo& info) 
    : Napi::ObjectWrap<NetworkInterfaceWrapper>(info), interface_(nullptr) {
    Napi::Env env = info.Env();
    Napi::HandleScope scope(env);

    try {
        if (info.Length() < 1) {
            Napi::TypeError::New(env, "Expected interface name as string").ThrowAsJavaScriptException();
            return;
        }

        if (!info[0].IsString()) {
            Napi::TypeError::New(env, "Interface name must be a string").ThrowAsJavaScriptException();
            return;
        }

        std::string name = info[0].As<Napi::String>().Utf8Value();
        if (name.empty()) {
            Napi::TypeError::New(env, "Interface name cannot be empty").ThrowAsJavaScriptException();
            return;
        }

        interface_ = new NetworkInterface(name);
    } catch (const std::exception& e) {
        Napi::Error::New(env, std::string("Failed to create NetworkInterface: ") + e.what()).ThrowAsJavaScriptException();
    }
}

Napi::Value NetworkInterfaceWrapper::GetName(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (!interface_) {
        Napi::Error::New(env, "NetworkInterface instance is invalid").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    try {
        return Napi::String::New(env, interface_->getName());
    } catch (const std::exception& e) {
        Napi::Error::New(env, std::string("Failed to get interface name: ") + e.what()).ThrowAsJavaScriptException();
        return env.Null();
    }
}

void NetworkInterfaceWrapper::SetName(const Napi::CallbackInfo& info, const Napi::Value& value) {
    Napi::Env env = info.Env();
    
    if (!interface_) {
        Napi::Error::New(env, "NetworkInterface instance is invalid").ThrowAsJavaScriptException();
        return;
    }
    
    if (!value.IsString()) {
        Napi::TypeError::New(env, "Interface name must be a string").ThrowAsJavaScriptException();
        return;
    }
    
    try {
        std::string name = value.As<Napi::String>().Utf8Value();
        if (name.empty()) {
            Napi::TypeError::New(env, "Interface name cannot be empty").ThrowAsJavaScriptException();
            return;
        }
        
        interface_->setName(name);
    } catch (const std::exception& e) {
        Napi::Error::New(env, std::string("Failed to set interface name: ") + e.what()).ThrowAsJavaScriptException();
    }
}
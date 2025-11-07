#include "network_sniffer.napi.hpp"

Napi::FunctionReference NetworkSnifferWrapper::constructor;

Napi::Object NetworkSnifferWrapper::Init(Napi::Env env, Napi::Object exports) {
    Napi::HandleScope scope(env);

    Napi::Function func = DefineClass(env, "NetworkSniffer", {
        InstanceMethod("startSniffing", &NetworkSnifferWrapper::StartSniffing),
        InstanceMethod("stopSniffing", &NetworkSnifferWrapper::StopSniffing),
        InstanceMethod("isRunning", &NetworkSnifferWrapper::IsRunning)
    });

    constructor = Napi::Persistent(func);
    constructor.SuppressDestruct();

    exports.Set("NetworkSniffer", func);
    return exports;
}

NetworkSnifferWrapper::NetworkSnifferWrapper(const Napi::CallbackInfo& info) 
    : Napi::ObjectWrap<NetworkSnifferWrapper>(info), sniffer_(nullptr) {
    Napi::Env env = info.Env();
    Napi::HandleScope scope(env);

    try {
        sniffer_ = new NetworkSniffer();
    } catch (const std::exception& e) {
        Napi::Error::New(env, std::string("Failed to create NetworkSniffer: ") + e.what()).ThrowAsJavaScriptException();
    }
}

Napi::Value NetworkSnifferWrapper::StartSniffing(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (!sniffer_) {
        Napi::Error::New(env, "NetworkSniffer instance is invalid").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    if (info.Length() < 2) {
        Napi::TypeError::New(env, "Expected NetworkInterface and callback function").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    if (!info[0].IsObject()) {
        Napi::TypeError::New(env, "First argument must be a NetworkInterface instance").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    if (!info[1].IsFunction()) {
        Napi::TypeError::New(env, "Second argument must be a callback function").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    try {
        // Get NetworkInterface from wrapper
        NetworkInterfaceWrapper* interface_wrapper = Napi::ObjectWrap<NetworkInterfaceWrapper>::Unwrap(info[0].As<Napi::Object>());
        if (!interface_wrapper) {
            Napi::Error::New(env, "Invalid NetworkInterface instance").ThrowAsJavaScriptException();
            return env.Null();
        }
        
        // Store JavaScript callback
        js_callback_ = Napi::Persistent(info[1].As<Napi::Function>());
        
        // Create C++ callback that calls JavaScript function
        PacketCallback cpp_callback = [this, env](const RawPacket& packet) {
            if (!js_callback_.IsEmpty()) {
                Napi::HandleScope scope(env);
                
                try {
                    Napi::Object js_packet = RawPacketToJS(env, packet);
                    js_callback_.Call({js_packet});
                } catch (const std::exception& e) {
                    // Log error but don't throw to avoid crashing capture thread
                }
            }
        };
        
        // Get NetworkInterface from wrapper
        NetworkInterface* interface = interface_wrapper->GetNativeInterface();
        if (!interface) {
            Napi::Error::New(env, "NetworkInterface instance is null").ThrowAsJavaScriptException();
            return env.Null();
        }
        
        bool success = sniffer_->startSniffing(*interface, cpp_callback);
        return Napi::Boolean::New(env, success);
        
    } catch (const std::exception& e) {
        Napi::Error::New(env, std::string("Failed to start sniffing: ") + e.what()).ThrowAsJavaScriptException();
        return env.Null();
    }
}

Napi::Value NetworkSnifferWrapper::StopSniffing(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (!sniffer_) {
        Napi::Error::New(env, "NetworkSniffer instance is invalid").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    try {
        sniffer_->stop();
        if (!js_callback_.IsEmpty()) {
            js_callback_.Reset();
        }
        return env.Undefined();
    } catch (const std::exception& e) {
        Napi::Error::New(env, std::string("Failed to stop sniffing: ") + e.what()).ThrowAsJavaScriptException();
        return env.Null();
    }
}

Napi::Value NetworkSnifferWrapper::IsRunning(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (!sniffer_) {
        Napi::Error::New(env, "NetworkSniffer instance is invalid").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    try {
        return Napi::Boolean::New(env, sniffer_->isRunning());
    } catch (const std::exception& e) {
        Napi::Error::New(env, std::string("Failed to check running status: ") + e.what()).ThrowAsJavaScriptException();
        return env.Null();
    }
}

Napi::Object NetworkSnifferWrapper::RawPacketToJS(Napi::Env env, const RawPacket& packet) {
    Napi::Object js_packet = Napi::Object::New(env);
    
    // Convert packet data to Buffer
    Napi::Buffer<uint8_t> buffer = Napi::Buffer<uint8_t>::Copy(env, packet.data.data(), packet.length);
    js_packet.Set("data", buffer);
    
    // Set packet metadata
    js_packet.Set("length", Napi::Number::New(env, packet.length));
    js_packet.Set("originalLength", Napi::Number::New(env, packet.original_length));
    js_packet.Set("valid", Napi::Boolean::New(env, packet.valid));
    
    // Convert timestamp to JavaScript Date
    auto time_since_epoch = packet.timestamp.time_since_epoch();
    auto milliseconds = std::chrono::duration_cast<std::chrono::milliseconds>(time_since_epoch).count();
    js_packet.Set("timestamp", Napi::Date::New(env, milliseconds));
    
    return js_packet;
}
#pragma once

#include "./ipv6ns_injector.hpp"
#include <memory>
#include <napi.h>

class Ipv6NsInjectorWrapper : public Napi::ObjectWrap<Ipv6NsInjectorWrapper> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  Ipv6NsInjectorWrapper(const Napi::CallbackInfo& info);
  ~Ipv6NsInjectorWrapper();

private:
  static Napi::FunctionReference constructor;
  std::unique_ptr<Ipv6NsInjector> injector_;

  Napi::Value Initialize(const Napi::CallbackInfo& info);
  Napi::Value Send(const Napi::CallbackInfo& info);
  Napi::Value Close(const Napi::CallbackInfo& info);
  Napi::Value IsInitialized(const Napi::CallbackInfo& info);
};

Napi::FunctionReference Ipv6NsInjectorWrapper::constructor;

Napi::Object Ipv6NsInjectorWrapper::Init(Napi::Env env, Napi::Object exports) {
  Napi::HandleScope scope(env);

  Napi::Function func = DefineClass(env, "Ipv6NsInjector",
                                    {
                                        InstanceMethod("initialize", &Ipv6NsInjectorWrapper::Initialize),
                                        InstanceMethod("send", &Ipv6NsInjectorWrapper::Send),
                                        InstanceMethod("close", &Ipv6NsInjectorWrapper::Close),
                                        InstanceMethod("isInitialized", &Ipv6NsInjectorWrapper::IsInitialized),
                                    });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  exports.Set("Ipv6NsInjector", func);
  return exports;
}

Ipv6NsInjectorWrapper::Ipv6NsInjectorWrapper(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<Ipv6NsInjectorWrapper>(info) {
  injector_ = std::make_unique<Ipv6NsInjector>();
}

Ipv6NsInjectorWrapper::~Ipv6NsInjectorWrapper() {
  if (injector_) {
    injector_->close();
  }
}

Napi::Value Ipv6NsInjectorWrapper::Initialize(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Expected 1 argument: interfaceName (string)").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::string interface_name = info[0].As<Napi::String>().Utf8Value();

  if (interface_name.empty()) {
    Napi::TypeError::New(env, "Interface name cannot be empty").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  bool success = injector_->initialize(interface_name);
  return Napi::Boolean::New(env, success);
}

Napi::Value Ipv6NsInjectorWrapper::Send(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 2) {
    Napi::TypeError::New(env, "Expected 2 arguments: targetIpv6 (string) and icmpv6Data (Buffer)")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  if (!info[0].IsString()) {
    Napi::TypeError::New(env, "First argument must be a string (target IPv6)").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  if (!info[1].IsBuffer()) {
    Napi::TypeError::New(env, "Second argument must be a Buffer (ICMPv6 data)").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::string target_ipv6 = info[0].As<Napi::String>().Utf8Value();
  Napi::Buffer<uint8_t> buffer = info[1].As<Napi::Buffer<uint8_t>>();
  const uint8_t* data = buffer.Data();
  size_t length = buffer.Length();

  bool success = injector_->send(target_ipv6, data, length);

  if (!success) {
    Napi::Error::New(env, "Failed to send ICMPv6 packet").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  return Napi::Boolean::New(env, true);
}

Napi::Value Ipv6NsInjectorWrapper::Close(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  injector_->close();
  return env.Undefined();
}

Napi::Value Ipv6NsInjectorWrapper::IsInitialized(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  return Napi::Boolean::New(env, injector_->isInitialized());
}

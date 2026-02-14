#pragma once

#include "./icmpv6_injector.hpp"
#include <memory>
#include <napi.h>

class Icmpv6InjectorWrapper : public Napi::ObjectWrap<Icmpv6InjectorWrapper> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  Icmpv6InjectorWrapper(const Napi::CallbackInfo& info);
  ~Icmpv6InjectorWrapper();

private:
  static Napi::FunctionReference constructor;
  std::unique_ptr<Icmpv6Injector> injector_;

  Napi::Value Initialize(const Napi::CallbackInfo& info);
  Napi::Value Send(const Napi::CallbackInfo& info);
  Napi::Value Close(const Napi::CallbackInfo& info);
  Napi::Value IsInitialized(const Napi::CallbackInfo& info);
};

Napi::FunctionReference Icmpv6InjectorWrapper::constructor;

Napi::Object Icmpv6InjectorWrapper::Init(Napi::Env env, Napi::Object exports) {
  Napi::HandleScope scope(env);

  Napi::Function func = DefineClass(env, "Icmpv6Injector",
                                    {
                                        InstanceMethod("initialize", &Icmpv6InjectorWrapper::Initialize),
                                        InstanceMethod("send", &Icmpv6InjectorWrapper::Send),
                                        InstanceMethod("close", &Icmpv6InjectorWrapper::Close),
                                        InstanceMethod("isInitialized", &Icmpv6InjectorWrapper::IsInitialized),
                                    });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  exports.Set("Icmpv6Injector", func);
  return exports;
}

Icmpv6InjectorWrapper::Icmpv6InjectorWrapper(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<Icmpv6InjectorWrapper>(info) {
  injector_ = std::make_unique<Icmpv6Injector>();
}

Icmpv6InjectorWrapper::~Icmpv6InjectorWrapper() {
  if (injector_) {
    injector_->close();
  }
}

Napi::Value Icmpv6InjectorWrapper::Initialize(const Napi::CallbackInfo& info) {
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

Napi::Value Icmpv6InjectorWrapper::Send(const Napi::CallbackInfo& info) {
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

Napi::Value Icmpv6InjectorWrapper::Close(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  injector_->close();
  return env.Undefined();
}

Napi::Value Icmpv6InjectorWrapper::IsInitialized(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  return Napi::Boolean::New(env, injector_->isInitialized());
}

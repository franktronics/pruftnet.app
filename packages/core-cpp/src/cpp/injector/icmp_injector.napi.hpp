#pragma once

#include "./icmp_injector.hpp"
#include <memory>
#include <napi.h>

class IcmpInjectorWrapper : public Napi::ObjectWrap<IcmpInjectorWrapper> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  IcmpInjectorWrapper(const Napi::CallbackInfo& info);
  ~IcmpInjectorWrapper();

private:
  static Napi::FunctionReference constructor;
  std::unique_ptr<IcmpInjector> injector_;

  Napi::Value Initialize(const Napi::CallbackInfo& info);
  Napi::Value Send(const Napi::CallbackInfo& info);
  Napi::Value Close(const Napi::CallbackInfo& info);
  Napi::Value IsInitialized(const Napi::CallbackInfo& info);
};

Napi::FunctionReference IcmpInjectorWrapper::constructor;

Napi::Object IcmpInjectorWrapper::Init(Napi::Env env, Napi::Object exports) {
  Napi::HandleScope scope(env);

  Napi::Function func = DefineClass(env, "IcmpInjector",
                                    {
                                        InstanceMethod("initialize", &IcmpInjectorWrapper::Initialize),
                                        InstanceMethod("send", &IcmpInjectorWrapper::Send),
                                        InstanceMethod("close", &IcmpInjectorWrapper::Close),
                                        InstanceMethod("isInitialized", &IcmpInjectorWrapper::IsInitialized),
                                    });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  exports.Set("IcmpInjector", func);
  return exports;
}

IcmpInjectorWrapper::IcmpInjectorWrapper(const Napi::CallbackInfo& info) : Napi::ObjectWrap<IcmpInjectorWrapper>(info) {
  injector_ = std::make_unique<IcmpInjector>();
}

IcmpInjectorWrapper::~IcmpInjectorWrapper() {
  if (injector_) {
    injector_->close();
  }
}

Napi::Value IcmpInjectorWrapper::Initialize(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  std::string interface_name = "";

  if (info.Length() >= 1 && info[0].IsString()) {
    interface_name = info[0].As<Napi::String>().Utf8Value();
  }

  bool success = injector_->initialize(interface_name);
  return Napi::Boolean::New(env, success);
}

Napi::Value IcmpInjectorWrapper::Send(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 2) {
    Napi::TypeError::New(env, "Expected 2 arguments: targetIp (string) and icmpData (Buffer)")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  if (!info[0].IsString()) {
    Napi::TypeError::New(env, "First argument must be a string (target IP)").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  if (!info[1].IsBuffer()) {
    Napi::TypeError::New(env, "Second argument must be a Buffer (ICMP data)").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::string target_ip = info[0].As<Napi::String>().Utf8Value();
  Napi::Buffer<uint8_t> buffer = info[1].As<Napi::Buffer<uint8_t>>();
  const uint8_t* data = buffer.Data();
  size_t length = buffer.Length();

  bool success = injector_->send(target_ip, data, length);

  if (!success) {
    Napi::Error::New(env, "Failed to send ICMP packet").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  return Napi::Boolean::New(env, true);
}

Napi::Value IcmpInjectorWrapper::Close(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  injector_->close();
  return env.Undefined();
}

Napi::Value IcmpInjectorWrapper::IsInitialized(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  return Napi::Boolean::New(env, injector_->isInitialized());
}

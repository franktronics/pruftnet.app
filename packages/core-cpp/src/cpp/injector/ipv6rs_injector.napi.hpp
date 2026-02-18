#pragma once

#include "./ipv6rs_injector.hpp"
#include <memory>
#include <napi.h>

class Ipv6RsInjectorWrapper : public Napi::ObjectWrap<Ipv6RsInjectorWrapper> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  Ipv6RsInjectorWrapper(const Napi::CallbackInfo& info);
  ~Ipv6RsInjectorWrapper();

private:
  static Napi::FunctionReference constructor;
  std::unique_ptr<Ipv6RsInjector> injector_;

  Napi::Value Initialize(const Napi::CallbackInfo& info);
  Napi::Value Send(const Napi::CallbackInfo& info);
  Napi::Value Close(const Napi::CallbackInfo& info);
  Napi::Value IsInitialized(const Napi::CallbackInfo& info);
};

Napi::FunctionReference Ipv6RsInjectorWrapper::constructor;

Napi::Object Ipv6RsInjectorWrapper::Init(Napi::Env env, Napi::Object exports) {
  Napi::HandleScope scope(env);

  Napi::Function func = DefineClass(env, "Ipv6RsInjector",
                                    {
                                        InstanceMethod("initialize", &Ipv6RsInjectorWrapper::Initialize),
                                        InstanceMethod("send", &Ipv6RsInjectorWrapper::Send),
                                        InstanceMethod("close", &Ipv6RsInjectorWrapper::Close),
                                        InstanceMethod("isInitialized", &Ipv6RsInjectorWrapper::IsInitialized),
                                    });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  exports.Set("Ipv6RsInjector", func);
  return exports;
}

Ipv6RsInjectorWrapper::Ipv6RsInjectorWrapper(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<Ipv6RsInjectorWrapper>(info) {
  injector_ = std::make_unique<Ipv6RsInjector>();
}

Ipv6RsInjectorWrapper::~Ipv6RsInjectorWrapper() {
  if (injector_) {
    injector_->close();
  }
}

Napi::Value Ipv6RsInjectorWrapper::Initialize(const Napi::CallbackInfo& info) {
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

Napi::Value Ipv6RsInjectorWrapper::Send(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  bool success = injector_->send();

  if (!success) {
    Napi::Error::New(env, "Failed to send Router Solicitation").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  return Napi::Boolean::New(env, true);
}

Napi::Value Ipv6RsInjectorWrapper::Close(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  injector_->close();
  return env.Undefined();
}

Napi::Value Ipv6RsInjectorWrapper::IsInitialized(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  return Napi::Boolean::New(env, injector_->isInitialized());
}

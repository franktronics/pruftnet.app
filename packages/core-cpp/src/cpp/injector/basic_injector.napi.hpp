#pragma once

#include "./basic_injector.hpp"
#include <memory>
#include <napi.h>

class BasicInjectorWrapper : public Napi::ObjectWrap<BasicInjectorWrapper> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  BasicInjectorWrapper(const Napi::CallbackInfo& info);
  ~BasicInjectorWrapper();

private:
  static Napi::FunctionReference constructor;
  std::unique_ptr<BasicInjector> injector_;

  Napi::Value Initialize(const Napi::CallbackInfo& info);
  Napi::Value Send(const Napi::CallbackInfo& info);
  Napi::Value Close(const Napi::CallbackInfo& info);
  Napi::Value IsInitialized(const Napi::CallbackInfo& info);
};

Napi::FunctionReference BasicInjectorWrapper::constructor;

Napi::Object BasicInjectorWrapper::Init(Napi::Env env, Napi::Object exports) {
  Napi::HandleScope scope(env);

  Napi::Function func = DefineClass(env, "BasicInjector",
                                    {
                                        InstanceMethod("initialize", &BasicInjectorWrapper::Initialize),
                                        InstanceMethod("send", &BasicInjectorWrapper::Send),
                                        InstanceMethod("close", &BasicInjectorWrapper::Close),
                                        InstanceMethod("isInitialized", &BasicInjectorWrapper::IsInitialized),
                                    });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  exports.Set("BasicInjector", func);
  return exports;
}

BasicInjectorWrapper::BasicInjectorWrapper(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<BasicInjectorWrapper>(info) {
  injector_ = std::make_unique<BasicInjector>();
}

BasicInjectorWrapper::~BasicInjectorWrapper() {
  if (injector_) {
    injector_->close();
  }
}

Napi::Value BasicInjectorWrapper::Initialize(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Expected interface name as string").ThrowAsJavaScriptException();
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

Napi::Value BasicInjectorWrapper::Send(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsBuffer()) {
    Napi::TypeError::New(env, "Expected Buffer as first argument").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  Napi::Buffer<uint8_t> buffer = info[0].As<Napi::Buffer<uint8_t>>();
  const uint8_t* data = buffer.Data();
  size_t length = buffer.Length();

  bool success = injector_->send(data, length);

  if (!success) {
    Napi::Error::New(env, "Failed to send packet").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  return Napi::Boolean::New(env, true);
}

Napi::Value BasicInjectorWrapper::Close(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  injector_->close();
  return env.Undefined();
}

Napi::Value BasicInjectorWrapper::IsInitialized(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  return Napi::Boolean::New(env, injector_->isInitialized());
}

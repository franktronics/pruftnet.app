#include "./network_sniffer.napi.hpp"
#include "../../utils/packets/packet_model.hpp"

Napi::FunctionReference NetworkSnifferWrapper::constructor;

NetworkSnifferWrapper::NetworkSnifferWrapper(const Napi::CallbackInfo &info)
    : Napi::ObjectWrap<NetworkSnifferWrapper>(info) {
  Napi::Env env = info.Env();

  if (info.Length() != 0) {
    Napi::TypeError::New(env, "NetworkSniffer constructor takes no arguments")
        .ThrowAsJavaScriptException();
    return;
  }

  sniffer_ = std::make_unique<NetworkSniffer>();
}

NetworkSnifferWrapper::~NetworkSnifferWrapper() {
  if (sniffer_ && sniffer_->isRunning()) {
    sniffer_->stopSniffing();
  }
  
  if (tsfn_) {
    tsfn_.Release();
  }
}

Napi::Object NetworkSnifferWrapper::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(
      env, "NetworkSniffer",
      {
          InstanceMethod("startSniffing", &NetworkSnifferWrapper::StartSniffing),
          InstanceMethod("stopSniffing", &NetworkSnifferWrapper::StopSniffing),
          InstanceMethod("isRunning", &NetworkSnifferWrapper::IsRunning),
      });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  exports.Set("NetworkSniffer", func);
  return exports;
}

Napi::Value NetworkSnifferWrapper::StartSniffing(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  if (info.Length() < 2) {
    Napi::TypeError::New(env, "Expected 2 arguments: interface name and callback")
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  if (!info[0].IsString()) {
    Napi::TypeError::New(env, "Interface name must be a string")
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  if (!info[1].IsFunction()) {
    Napi::TypeError::New(env, "Second argument must be a callback function")
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  std::string interface_name = info[0].As<Napi::String>().Utf8Value();
  Napi::Function callback = info[1].As<Napi::Function>();

  if (tsfn_) {
    tsfn_.Release();
  }

  tsfn_ = Napi::ThreadSafeFunction::New(
      env, callback, "PacketCallback", 0, 1);

  auto packet_callback = [this](const RawPacket &packet) {
    auto callback = [packet](Napi::Env env, Napi::Function jsCallback) {
      Napi::Object obj = Napi::Object::New(env);

      Napi::Buffer<uint8_t> buffer =
          Napi::Buffer<uint8_t>::Copy(env, packet.data.data(), packet.length);
      obj.Set("data", buffer);
      obj.Set("length", Napi::Number::New(env, packet.length));
      obj.Set("originalLength", Napi::Number::New(env, packet.original_length));

      auto time_ms = std::chrono::duration_cast<std::chrono::milliseconds>(
                         packet.timestamp.time_since_epoch())
                         .count();
      obj.Set("timestamp", Napi::Date::New(env, static_cast<double>(time_ms)));
      obj.Set("valid", Napi::Boolean::New(env, packet.valid));

      jsCallback.Call({obj});
    };

    if (tsfn_) {
      tsfn_.BlockingCall(callback);
    }
  };

  bool success = sniffer_->startSniffing(interface_name, packet_callback);

  if (!success) {
    Napi::Error::New(env, 
        "Failed to start sniffing. Raw sockets require root privileges. "
        "Try running with sudo or check if the interface exists.")
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  return Napi::Boolean::New(env, success);
}

void NetworkSnifferWrapper::StopSniffing(const Napi::CallbackInfo &info) {
  sniffer_->stopSniffing();

  if (tsfn_) {
    tsfn_.Release();
  }
}

Napi::Value NetworkSnifferWrapper::IsRunning(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  return Napi::Boolean::New(env, sniffer_->isRunning());
}

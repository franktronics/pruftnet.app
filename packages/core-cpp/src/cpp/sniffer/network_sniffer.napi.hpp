#pragma once

#include "../parser/packet_parser.hpp"
#include "./network_sniffer.hpp"
#include <cstring>
#include <memory>
#include <napi.h>
#include <iostream>

class NetworkSnifferWrapper;

struct CallbackData {
  RawPacket raw;
  ParsedPacket parsed;
};

class NapiPacketCallback : public PacketCallback {
private:
  mutable Napi::ThreadSafeFunction tsfn_;
  ParserModel* parser_;

public:
  NapiPacketCallback(Napi::ThreadSafeFunction tsfn, ParserModel* parser) : tsfn_(std::move(tsfn)), parser_(parser) {}

  void operator()(const RawPacket& raw, const ParsedPacket& parsed) const override {
    CallbackData* data = new CallbackData{raw, parsed};

    tsfn_.BlockingCall(data, [this](Napi::Env env, Napi::Function jsCallback, CallbackData* cb_data) {
      try {
        Napi::Object raw_obj = cb_data->raw.toNapiObject(env);
        Napi::Array parsed_arr = cb_data->parsed.toNapiArray(env);

        Napi::Object result = Napi::Object::New(env);
        result.Set("raw", raw_obj);
        result.Set("parsed", parsed_arr);

        jsCallback.Call({result});
      } catch (const std::exception& e) {
        std::cerr << "Exception in N-API callback: " << e.what() << std::endl;
      } catch (...) {
        std::cerr << "Unknown exception in N-API callback" << std::endl;
      }
      delete cb_data;
    });
  };
};

class NetworkSnifferWrapper : public Napi::ObjectWrap<NetworkSnifferWrapper> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  NetworkSnifferWrapper(const Napi::CallbackInfo& info);
  ~NetworkSnifferWrapper();
  ParserModel* getParser() const;

private:
  static Napi::FunctionReference constructor;

  std::unique_ptr<NetworkSniffer> sniffer_;
  Napi::ThreadSafeFunction tsfn_;
  bool tsfn_active_ = false;
  std::string protocols_path_;

  Napi::Value StartSniffing(const Napi::CallbackInfo& info);
  Napi::Value StopSniffing(const Napi::CallbackInfo& info);
  Napi::Value IsRunning(const Napi::CallbackInfo& info);
};

// Implementation

Napi::FunctionReference NetworkSnifferWrapper::constructor;

Napi::Object NetworkSnifferWrapper::Init(Napi::Env env, Napi::Object exports) {
  Napi::HandleScope scope(env);

  Napi::Function func = DefineClass(env, "NetworkSniffer",
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

NetworkSnifferWrapper::NetworkSnifferWrapper(const Napi::CallbackInfo& info)
    : Napi::ObjectWrap<NetworkSnifferWrapper>(info) {

  Napi::Env env = info.Env();

  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "Expected protocols path as first argument").ThrowAsJavaScriptException();
    return;
  }

  protocols_path_ = info[0].As<Napi::String>().Utf8Value();

  sniffer_ = std::make_unique<NetworkSniffer>();
  auto parser = std::make_unique<PacketParser>();
  parser->setProtocolEntryFile(protocols_path_);
  sniffer_->setParser(std::move(parser));
}

NetworkSnifferWrapper::~NetworkSnifferWrapper() {
  if (sniffer_) {
    sniffer_->stopSniffing();
  }

  if (tsfn_active_) {
    tsfn_.Release();
    tsfn_active_ = false;
  }
}

ParserModel* NetworkSnifferWrapper::getParser() const {
  return sniffer_->getParser();
}

Napi::Value NetworkSnifferWrapper::StartSniffing(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 2) {
    Napi::TypeError::New(env, "Expected 2 arguments: interface name and callback").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  if (!info[0].IsString()) {
    Napi::TypeError::New(env, "First argument must be interface name string").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  if (!info[1].IsFunction()) {
    Napi::TypeError::New(env, "Second argument must be callback function").ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::string interface_name = info[0].As<Napi::String>().Utf8Value();
  Napi::Function callback = info[1].As<Napi::Function>();

  tsfn_ = Napi::ThreadSafeFunction::New(env, callback, "PacketCallback", 0, 1, [](Napi::Env) {});
  tsfn_active_ = true;

  auto packet_callback = std::make_unique<NapiPacketCallback>(tsfn_, getParser());

  bool success = sniffer_->startSniffing(interface_name, std::move(packet_callback));

  if (!success) {
    tsfn_.Release();
    tsfn_active_ = false;
    return Napi::Boolean::New(env, false);
  }

  return Napi::Boolean::New(env, true);
}

Napi::Value NetworkSnifferWrapper::StopSniffing(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  sniffer_->stopSniffing();

  if (tsfn_active_) {
    tsfn_.Release();
    tsfn_active_ = false;
  }

  return env.Undefined();
}

Napi::Value NetworkSnifferWrapper::IsRunning(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  return Napi::Boolean::New(env, sniffer_->isRunning());
}
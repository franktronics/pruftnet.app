#pragma once

#include <napi.h>
#include "./network_sniffer.hpp"
#include <memory>

class NetworkSnifferWrapper : public Napi::ObjectWrap<NetworkSnifferWrapper> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  NetworkSnifferWrapper(const Napi::CallbackInfo &info);
  ~NetworkSnifferWrapper();

private:
  static Napi::FunctionReference constructor;
  
  std::unique_ptr<NetworkSniffer> sniffer_;
  Napi::ThreadSafeFunction tsfn_;

  Napi::Value StartSniffing(const Napi::CallbackInfo &info);
  void StopSniffing(const Napi::CallbackInfo &info);
  Napi::Value IsRunning(const Napi::CallbackInfo &info);
};

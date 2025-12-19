#pragma once

#include "../parser/packet_parser.hpp"
#include "./network_sniffer.hpp"
#include <memory>
#include <napi.h>

/**
 * N-API wrapper for NetworkSniffer
 * Handles thread-safe callbacks to JavaScript and automatic parser injection
 */
class NetworkSnifferWrapper : public Napi::ObjectWrap<NetworkSnifferWrapper> {
public:
  static Napi::Object Init(Napi::Env env, Napi::Object exports);
  NetworkSnifferWrapper(const Napi::CallbackInfo &info);
  ~NetworkSnifferWrapper();

private:
  static Napi::FunctionReference constructor;

  std::unique_ptr<NetworkSniffer> sniffer_;
  Napi::ThreadSafeFunction tsfn_;
  bool tsfn_active_ = false;

  // JavaScript methods
  Napi::Value StartSniffing(const Napi::CallbackInfo &info);
  Napi::Value StopSniffing(const Napi::CallbackInfo &info);
  Napi::Value IsRunning(const Napi::CallbackInfo &info);

  // Helper to convert ParsedPacket to JS object
  static Napi::Object ParsedPacketToJs(Napi::Env env,
                                       const ParsedPacket &parsed);

  // Helper to convert RawPacket to JS object
  static Napi::Object RawPacketToJs(Napi::Env env, const RawPacket &raw);
};

// Implementation

Napi::FunctionReference NetworkSnifferWrapper::constructor;

Napi::Object NetworkSnifferWrapper::Init(Napi::Env env, Napi::Object exports) {
  Napi::HandleScope scope(env);

  Napi::Function func = DefineClass(
      env, "NetworkSniffer",
      {
          InstanceMethod("startSniffing",
                         &NetworkSnifferWrapper::StartSniffing),
          InstanceMethod("stopSniffing", &NetworkSnifferWrapper::StopSniffing),
          InstanceMethod("isRunning", &NetworkSnifferWrapper::IsRunning),
      });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  exports.Set("NetworkSniffer", func);
  return exports;
}

NetworkSnifferWrapper::NetworkSnifferWrapper(const Napi::CallbackInfo &info)
    : Napi::ObjectWrap<NetworkSnifferWrapper>(info) {

  sniffer_ = std::make_unique<NetworkSniffer>();

  // Automatically inject the parser
  sniffer_->setParser(std::make_unique<PacketParser>());
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

Napi::Value
NetworkSnifferWrapper::StartSniffing(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  if (info.Length() < 2) {
    Napi::TypeError::New(env,
                         "Expected 2 arguments: interface name and callback")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  if (!info[0].IsString()) {
    Napi::TypeError::New(env, "First argument must be interface name string")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  if (!info[1].IsFunction()) {
    Napi::TypeError::New(env, "Second argument must be callback function")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  std::string interface_name = info[0].As<Napi::String>().Utf8Value();
  Napi::Function callback = info[1].As<Napi::Function>();

  // Create ThreadSafe function for calling JS from background thread
  tsfn_ = Napi::ThreadSafeFunction::New(env, callback, "PacketCallback",
                                        0, // Unlimited queue
                                        1, // 1 thread using this
                                        [](Napi::Env) {
                                          // Cleanup callback - nothing needed
                                        });
  tsfn_active_ = true;

  // Capture ThreadSafe function for use in callback
  auto *tsfn_ptr = &tsfn_;

  // Start sniffing with callback that marshals to JS
  bool success = sniffer_->startSniffing(
      interface_name,
      [tsfn_ptr](const RawPacket &raw, const ParsedPacket &parsed) {
        // This runs in background thread - must use ThreadSafe function
        tsfn_ptr->BlockingCall(
            [raw, parsed](Napi::Env env, Napi::Function jsCallback) {
              Napi::Object result = Napi::Object::New(env);
              result.Set("raw", RawPacketToJs(env, raw));
              result.Set("parsed", ParsedPacketToJs(env, parsed));
              jsCallback.Call({result});
            });
      });

  if (!success) {
    tsfn_.Release();
    tsfn_active_ = false;
    return Napi::Boolean::New(env, false);
  }

  return Napi::Boolean::New(env, true);
}

Napi::Value
NetworkSnifferWrapper::StopSniffing(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  sniffer_->stopSniffing();

  if (tsfn_active_) {
    tsfn_.Release();
    tsfn_active_ = false;
  }

  return env.Undefined();
}

Napi::Value NetworkSnifferWrapper::IsRunning(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  return Napi::Boolean::New(env, sniffer_->isRunning());
}

Napi::Object NetworkSnifferWrapper::RawPacketToJs(Napi::Env env,
                                                  const RawPacket &raw) {
  Napi::Object obj = Napi::Object::New(env);

  // Copy raw data to Buffer
  Napi::Buffer<uint8_t> buffer =
      Napi::Buffer<uint8_t>::Copy(env, raw.data.data(), raw.length);

  obj.Set("data", buffer);
  obj.Set("length", Napi::Number::New(env, static_cast<double>(raw.length)));
  obj.Set("originalLength",
          Napi::Number::New(env, static_cast<double>(raw.original_length)));

  // Convert timestamp to milliseconds since epoch
  auto epoch = raw.timestamp.time_since_epoch();
  auto millis =
      std::chrono::duration_cast<std::chrono::milliseconds>(epoch).count();
  obj.Set("timestamp", Napi::Number::New(env, static_cast<double>(millis)));

  obj.Set("valid", Napi::Boolean::New(env, raw.valid));

  return obj;
}

Napi::Object
NetworkSnifferWrapper::ParsedPacketToJs(Napi::Env env,
                                        const ParsedPacket &parsed) {
  Napi::Object obj = Napi::Object::New(env);

  obj.Set("protocolCount", Napi::Number::New(env, parsed.protocol_count));
  obj.Set("valid", Napi::Boolean::New(env, parsed.valid));

  Napi::Array protocols = Napi::Array::New(env, parsed.protocol_count);

  for (uint8_t i = 0; i < parsed.protocol_count; ++i) {
    const ProtocolEntry &proto = parsed.protocols[i];
    Napi::Object protoObj = Napi::Object::New(env);

    protoObj.Set("protocolId", Napi::Number::New(env, static_cast<uint8_t>(
                                                          proto.protocol_id)));
    protoObj.Set("headerOffset", Napi::Number::New(env, proto.header_offset));
    protoObj.Set("fieldCount", Napi::Number::New(env, proto.field_count));

    Napi::Array fields = Napi::Array::New(env, proto.field_count);

    for (uint8_t j = 0; j < proto.field_count; ++j) {
      const FieldEntry &field = proto.fields[j];
      Napi::Object fieldObj = Napi::Object::New(env);

      fieldObj.Set("byteOffset", Napi::Number::New(env, field.byte_offset));
      fieldObj.Set("byteLength", Napi::Number::New(env, field.byte_length));
      fieldObj.Set("fieldId", Napi::Number::New(env, field.field_id));

      fields.Set(j, fieldObj);
    }

    protoObj.Set("fields", fields);
    protocols.Set(i, protoObj);
  }

  obj.Set("protocols", protocols);

  return obj;
}

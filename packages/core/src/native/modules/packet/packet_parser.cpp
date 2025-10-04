#include "packet_parser.hpp"
#include <chrono>

namespace pruftcore {
namespace packet {

Napi::FunctionReference PacketParser::constructor;

void PacketParser::Init(Napi::Env env, Napi::Object exports) {
  Napi::HandleScope scope(env);

  Napi::Function func = DefineClass(env, "PacketParser", {
    InstanceMethod("getTestData", &PacketParser::GetTestData)
  });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  exports.Set("PacketParser", func);
}

PacketParser::PacketParser(const Napi::CallbackInfo& info)
  : Napi::ObjectWrap<PacketParser>(info) {
  // For minimal structure we ignore constructor args for now
}

Napi::Value PacketParser::GetTestData(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  auto now = std::chrono::system_clock::now();
  auto ms = std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()).count();

  Napi::Object obj = Napi::Object::New(env);
  obj.Set("id", Napi::Number::New(env, 1));
  obj.Set("message", Napi::String::New(env, "ok"));
  obj.Set("timestamp", Napi::Number::New(env, static_cast<double>(ms)));
  return obj;
}

} // namespace packet
} // namespace pruftcore

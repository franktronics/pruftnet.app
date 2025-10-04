#pragma once
#include <napi.h>
#include <string>

namespace pruftcore {
namespace packet {

class PacketParser : public Napi::ObjectWrap<PacketParser> {
public:
  static Napi::FunctionReference constructor;
  static void Init(Napi::Env env, Napi::Object exports);

  PacketParser(const Napi::CallbackInfo& info);

private:
  Napi::Value GetTestData(const Napi::CallbackInfo& info);
};

} // namespace packet
} // namespace pruftcore

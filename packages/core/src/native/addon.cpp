#include <napi.h>
#include "modules/packet/packet_parser.hpp"

Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
  pruftcore::packet::PacketParser::Init(env, exports);
  return exports;
}

NODE_API_MODULE(pruftcore, InitAll)

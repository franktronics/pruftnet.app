#include <napi.h>
#include "modules/datetime/datetime.hpp"

Napi::Object InitAll(Napi::Env env, Napi::Object exports) {
  // Expose namespaces for each module
  exports.Set("datetime", DateTime::Init(env));
  return exports;
}

NODE_API_MODULE(core, InitAll)


#include <napi.h>

#ifdef __linux__
#include "modules/sniffer/network_sniffer.napi.hpp"
#endif

Napi::Object Init(Napi::Env env, Napi::Object exports) {

#ifdef __linux__
  NetworkSnifferWrapper::Init(env, exports);
#endif

  return exports;
}

NODE_API_MODULE(repo_core, Init)

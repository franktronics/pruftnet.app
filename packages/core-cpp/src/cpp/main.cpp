#include <napi.h>

#ifdef __linux__
#include "./injector/basic_injector.napi.hpp"
#include "./sniffer/network_sniffer.napi.hpp"
#endif

Napi::Object Init(Napi::Env env, Napi::Object exports) {

#ifdef __linux__
  NetworkSnifferWrapper::Init(env, exports);
  BasicInjectorWrapper::Init(env, exports);
#endif

  return exports;
}

NODE_API_MODULE(repo_core, Init)

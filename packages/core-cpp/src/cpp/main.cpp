#include <napi.h>

#ifdef __linux__
#include "./injector/basic_injector.napi.hpp"
#include "./injector/icmp_injector.napi.hpp"
#include "./injector/icmpv6_injector.napi.hpp"
#include "./injector/ipv6ns_injector.napi.hpp"
#include "./injector/ipv6rs_injector.napi.hpp"
#include "./sniffer/network_sniffer.napi.hpp"
#endif

Napi::Object Init(Napi::Env env, Napi::Object exports) {

#ifdef __linux__
  NetworkSnifferWrapper::Init(env, exports);
  BasicInjectorWrapper::Init(env, exports);
  IcmpInjectorWrapper::Init(env, exports);
  Icmpv6InjectorWrapper::Init(env, exports);
  Ipv6NsInjectorWrapper::Init(env, exports);
  Ipv6RsInjectorWrapper::Init(env, exports);
#endif

  return exports;
}

NODE_API_MODULE(repo_core, Init)

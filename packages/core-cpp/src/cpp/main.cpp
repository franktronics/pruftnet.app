#include <napi.h>
#include "modules/sniffer/network_sniffer.napi.hpp"

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    NetworkSnifferWrapper::Init(env, exports);
    
    return exports;
}

NODE_API_MODULE(repo_core, Init)
#include <napi.h>
#include "modules/parser/packet_parser.napi.hpp"

// Sniffer is only available on Linux (requires raw sockets)
#ifdef __linux__
#include "modules/sniffer/network_sniffer.napi.hpp"
#endif

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    PacketParserWrapper::Init(env, exports);
    
#ifdef __linux__
    NetworkSnifferWrapper::Init(env, exports);
#endif
    
    return exports;
}

NODE_API_MODULE(repo_core, Init)

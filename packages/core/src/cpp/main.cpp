#include <napi.h>
#include "modules/parser/packet_parser.napi.hpp"

#include <napi.h>
#include "modules/parser/packet_parser.napi.hpp"
#include "modules/sniffer/network_sniffer.napi.hpp"
#include "utils/network_interface/n_interface_model.napi.hpp"

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    // Export PacketParser class wrapper
    PacketParserWrapper::Init(env, exports);
    
    // Export NetworkSniffer class wrapper
    NetworkSnifferWrapper::Init(env, exports);
    
    // Export NetworkInterface class wrapper
    NetworkInterfaceWrapper::Init(env, exports);
    
    return exports;
}

NODE_API_MODULE(repo_core, Init)
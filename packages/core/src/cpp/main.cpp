#include <napi.h>
#include "modules/parser/packet_parser.hpp"
#include "modules/scanner/network_scanner_wrapper.hpp"

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    // Export PacketParser class (si elle existe)
    // PacketParser::Init(env, exports);
    
    // Export NetworkScanner class wrapper
    NetworkScannerWrapper::Init(env, exports);
    
    return exports;
}

NODE_API_MODULE(repo_core, Init)
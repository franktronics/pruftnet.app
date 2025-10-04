#include <napi.h>
#include "modules/packet_parser.hpp"
#include "modules/packet_analyzer.hpp"
#include "modules/network_scanner.hpp"

Napi::Object Init(Napi::Env env, Napi::Object exports) {
    // Export PacketParser class
    PacketParser::Init(env, exports);
    
    // Export PacketAnalyzer class
    PacketAnalyzer::Init(env, exports);
    
    // Export NetworkScanner class
    NetworkScanner::Init(env, exports);
    
    return exports;
}

NODE_API_MODULE(repo_core, Init)
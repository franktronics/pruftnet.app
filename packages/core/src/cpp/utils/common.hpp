#ifndef COMMON_HPP
#define COMMON_HPP

#include <string>
#include <vector>
#include <map>

namespace CoreUtils {
    // Common data structures
    struct PacketData {
        std::string source_ip;
        std::string dest_ip;
        int source_port;
        int dest_port;
        std::string protocol;
        std::vector<uint8_t> payload;
        long timestamp;
    };
    
    struct ScanResult {
        std::string target;
        bool is_alive;
        std::vector<int> open_ports;
        std::map<std::string, std::string> metadata;
    };
    
    struct AnalysisResult {
        std::string analysis_type;
        std::map<std::string, std::string> results;
        double confidence;
    };
}

#endif // COMMON_HPP
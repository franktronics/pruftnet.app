#pragma once
#include <optional>
#include <string>
#include <unordered_map>

struct ProtocolField {
    uint32_t offset;
    uint32_t length;
};

struct NextProtocol {
    std::string selector;
    std::string start_after;
    std::unordered_map<std::string, std::string> mappings;
};

struct ProtocolConfig {
    std::string name;
    std::unordered_map<std::string, ProtocolField> header;
    std::optional<NextProtocol> next_protocol;
};

class ProtocolLoader {
public:
    ProtocolLoader();
    ~ProtocolLoader();
    ProtocolConfig loadProtocol(const std::string& protocolFilePath);

private:
    std::unordered_map<std::string, ProtocolConfig> protocol_cache_;
};
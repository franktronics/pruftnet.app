#pragma once
#include <optional>
#include <string>
#include <unordered_map>
#include <array>
#include <cstdint>
#include <nlohmann/json_fwd.hpp>

struct ProtocolField {
    std::string description;
};

struct NextProtocol {
    std::string selector;
    std::string start_after;
    std::unordered_map<uint16_t, std::string> mappings;
};

struct OffsetLengthHash {
    std::size_t operator()(const std::array<uint32_t, 2>& arr) const {
        return std::hash<uint32_t>{}(arr[0]) ^ (std::hash<uint32_t>{}(arr[1]) << 1);
    }
};

struct ProtocolConfig {
    std::string name;
    std::unordered_map<std::array<uint32_t, 2>, ProtocolField, OffsetLengthHash> header;
    std::optional<NextProtocol> next_protocol;
};

class ProtocolLoader {
public:
    ProtocolLoader();
    ~ProtocolLoader();
    ProtocolConfig loadProtocol(const std::string& protocolFilePath);
    ProtocolConfig loadProtocolFromString(const std::string& protocolJsonString, const std::string& protocolFilePath);

private:
    ProtocolConfig parseProtocolJson(const nlohmann::json& j);
    std::unordered_map<std::string, ProtocolConfig> protocol_cache_;
};
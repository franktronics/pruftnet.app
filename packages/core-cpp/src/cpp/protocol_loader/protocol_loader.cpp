#include "protocol_loader.hpp"
#include <nlohmann/json.hpp>
#include <fstream>
#include <stdexcept>
#include <filesystem>

using json = nlohmann::json;
namespace fs = std::filesystem;

ProtocolLoader::ProtocolLoader() = default;

ProtocolLoader::~ProtocolLoader() = default;

ProtocolConfig ProtocolLoader::parseProtocolJson(const json& j) {
    ProtocolConfig config;
    config.name = j.at("name").get<std::string>();

    for (const auto& [field_key, field_data] : j.at("header").items()) {
        size_t underscore_pos = field_key.find('_');
        if (underscore_pos == std::string::npos) {
            throw std::runtime_error("Invalid header key format: " + field_key);
        }

        uint32_t offset = std::stoul(field_key.substr(0, underscore_pos));
        uint32_t length = std::stoul(field_key.substr(underscore_pos + 1));

        ProtocolField field;
        field.description = field_data.at("description").get<std::string>();
        config.header[{offset, length}] = field;
    }

    if (j.contains("next_protocol")) {
        NextProtocol next_proto;
        next_proto.selector = j["next_protocol"].at("selector").get<std::string>();
        next_proto.start_after = j["next_protocol"].at("start_after").get<std::string>();

        for (const auto& [key, value] : j["next_protocol"].at("mappings").items()) {
            uint16_t parsed_value;
            if (key.substr(0, 2) == "0x" || key.substr(0, 2) == "0X") {
                parsed_value = std::stoul(key, nullptr, 16);
            } else {
                parsed_value = std::stoul(key, nullptr, 10);
            }
            next_proto.mappings[parsed_value] = value.at("file").get<std::string>();
        }

        config.next_protocol = next_proto;
    }

    return config;
}

ProtocolConfig ProtocolLoader::loadProtocol(const std::string& protocolFilePath) {
    auto cache_it = protocol_cache_.find(protocolFilePath);
    if (cache_it != protocol_cache_.end()) {
        return cache_it->second;
    }

    std::ifstream file(protocolFilePath);
    if (!file.is_open()) {
        throw std::runtime_error("Failed to open protocol file: " + protocolFilePath);
    }

    json j;
    try {
        file >> j;
    } catch (const json::exception& e) {
        throw std::runtime_error("Failed to parse JSON from file " + protocolFilePath + ": " + e.what());
    }

    ProtocolConfig config = parseProtocolJson(j);
    protocol_cache_[protocolFilePath] = config;
    return config;
}

ProtocolConfig ProtocolLoader::loadProtocolFromString(const std::string& protocolJsonString, const std::string& protocolFilePath) {
    json j;
    try {
        j = json::parse(protocolJsonString);
    } catch (const json::exception& e) {
        throw std::runtime_error("Failed to parse JSON string: " + std::string(e.what()));
    }

    ProtocolConfig config = parseProtocolJson(j);
    protocol_cache_[protocolFilePath] = config;
    return config;
}

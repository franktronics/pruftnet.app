#include "protocol_loader.hpp"
#include <nlohmann/json.hpp>
#include <fstream>
#include <stdexcept>
#include <filesystem>

using json = nlohmann::json;
namespace fs = std::filesystem;

ProtocolLoader::ProtocolLoader() = default;

ProtocolLoader::~ProtocolLoader() = default;

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

    ProtocolConfig config;
    config.name = j.at("name").get<std::string>();

    for (const auto& [field_name, field_data] : j.at("header").items()) {
        ProtocolField field;
        field.offset = field_data.at("offset").get<uint32_t>();
        field.length = field_data.at("length").get<uint32_t>();
        config.header[field_name] = field;
    }

    if (j.contains("next_protocol")) {
        NextProtocol next_proto;
        next_proto.selector = j["next_protocol"].at("selector").get<std::string>();
        next_proto.start_after = j["next_protocol"].at("start_after").get<std::string>();

        for (const auto& [key, value] : j["next_protocol"].at("mappings").items()) {
            next_proto.mappings[key] = value.at("file").get<std::string>();
        }

        config.next_protocol = next_proto;
    }

    protocol_cache_[protocolFilePath] = config;
    return config;
}
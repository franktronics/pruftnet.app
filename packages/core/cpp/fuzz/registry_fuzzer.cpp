#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <fstream>
#include <iterator>
#include <string>
#include <variant>
#include <vector>

#include "pruftnet/parsing/registry.hpp"

extern "C" int LLVMFuzzerTestOneInput(const std::uint8_t* data, std::size_t size) {
    using namespace pruftnet::parsing;
    size = std::min<std::size_t>(size, 4'096);
    RegistryBuilder builder;
    std::vector<ProtocolId> protocols;

    for (std::size_t offset = 0; offset < size;) {
        const auto length = std::min<std::size_t>((data[offset] % 24U) + 1U, size - offset);
        std::string key;
        key.reserve(length + 2);
        key += "p";
        for (std::size_t index = 0; index < length; ++index) {
            const auto value = data[offset + index] % 38U;
            key += value < 26U   ? static_cast<char>('a' + value)
                   : value < 36U ? static_cast<char>('0' + value - 26U)
                                 : '_';
        }
        const auto protocol = builder.register_protocol(key, key);
        if (const auto* id = std::get_if<ProtocolId>(&protocol)) {
            protocols.push_back(*id);
            const auto field_key = key + ".field";
            (void)builder.register_field(*id, field_key, field_key, static_cast<FieldValueType>(data[offset] % 7U));
        }
        offset += length;
    }
    const auto snapshot = builder.freeze();
    if (const auto* registry = std::get_if<RegistrySnapshot>(&snapshot)) {
        for (const auto& protocol : registry->protocols()) {
            (void)registry->protocol(protocol.id);
            (void)registry->protocol(protocol.key);
        }
        for (const auto& field : registry->fields()) {
            (void)registry->field(field.id);
            (void)registry->field(field.key);
        }
    }
    return 0;
}

#if defined(PRUFTNET_STANDALONE_FUZZER)
int main(int argc, char** argv) {
    if (argc <= 1) {
        const std::uint8_t seed[] = {4, 1, 2, 3, 4, 8, 9, 10};
        return LLVMFuzzerTestOneInput(seed, sizeof(seed));
    }
    for (int index = 1; index < argc; ++index) {
        std::ifstream input(argv[index], std::ios::binary);
        std::vector<std::uint8_t> bytes{std::istreambuf_iterator<char>(input), std::istreambuf_iterator<char>()};
        (void)LLVMFuzzerTestOneInput(bytes.data(), bytes.size());
    }
    return 0;
}
#endif

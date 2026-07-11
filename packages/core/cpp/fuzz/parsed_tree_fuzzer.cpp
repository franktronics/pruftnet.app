#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <fstream>
#include <iterator>
#include <memory>
#include <span>
#include <variant>
#include <vector>

#include "pruftnet/parsing/parsed_tree.hpp"

extern "C" int LLVMFuzzerTestOneInput(const std::uint8_t* data, std::size_t size) {
    using namespace pruftnet::parsing;
    size = std::min<std::size_t>(size, 4'096);
    const auto registry_result = make_core_registry();
    const auto* registry_value = std::get_if<RegistrySnapshot>(&registry_result);
    if (registry_value == nullptr) {
        return 0;
    }
    const auto registry = std::make_shared<const RegistrySnapshot>(*registry_value);
    const auto root = std::get<std::reference_wrapper<const FieldDescriptor>>(registry->field("root.frame")).get().id;
    const auto bytes_field =
        std::get<std::reference_wrapper<const FieldDescriptor>>(registry->field("unknown.data")).get().id;
    const auto diagnostic =
        std::get<std::reference_wrapper<const FieldDescriptor>>(registry->field("diagnostics.message")).get().id;
    ParseBudget budget;
    budget.max_nodes = size == 0 ? 1 : (data[0] % 32U) + 1U;
    budget.max_depth = size < 2 ? 1 : (data[1] % 16U) + 1U;
    budget.max_value_bytes = 1'024;
    budget.max_source_bytes = 4'096;
    budget.max_string_bytes = 1'024;
    budget.max_encoded_bytes = 32'768;
    ParsedPacketTreeBuilder builder(registry, {.capture_id = {.high = 1, .low = 2}, .packet_id = 1}, budget);
    const auto source = builder.add_data_source(
        "fuzz", std::span<const std::byte>(reinterpret_cast<const std::byte*>(data), size), DataSourceKind::Captured);
    if (!std::holds_alternative<DataSourceId>(source)) {
        return 0;
    }
    const auto root_node = builder.add_none(root, kNoParentIndex, 0, 0, size);
    const auto* root_index = std::get_if<std::uint32_t>(&root_node);
    if (root_index == nullptr) {
        return 0;
    }
    for (std::size_t offset = 2; offset < size; offset += 8) {
        const auto length = std::min<std::size_t>(8, size - offset);
        if ((data[offset] & 1U) == 0) {
            (void)builder.add_bytes(
                bytes_field, *root_index, 0, offset, length,
                std::span<const std::byte>(reinterpret_cast<const std::byte*>(data + offset), length));
        } else {
            const std::string_view text(reinterpret_cast<const char*>(data + offset), length);
            (void)builder.add_generated_text(diagnostic, *root_index, 0, text);
        }
    }
    (void)builder.finalize();
    return 0;
}

#if defined(PRUFTNET_STANDALONE_FUZZER)
int main(int argc, char** argv) {
    if (argc <= 1) {
        const std::uint8_t seed[] = {8, 4, 1, 2, 3, 4, 5, 6, 7, 8};
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

#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <fstream>
#include <iterator>
#include <memory>
#include <span>
#include <stdexcept>
#include <string_view>
#include <variant>
#include <vector>

#include "parsing/packet_parser.hpp"

namespace {

pruftnet::parsing::RegistrySnapshotPtr registry() {
    auto result = pruftnet::parsing::make_core_registry();
    if (!std::holds_alternative<pruftnet::parsing::RegistrySnapshot>(result)) {
        throw std::runtime_error("Core registry bootstrap failed");
    }
    return std::make_shared<const pruftnet::parsing::RegistrySnapshot>(
        std::move(std::get<pruftnet::parsing::RegistrySnapshot>(result)));
}

pruftnet::parsing::internal::PacketParser node_limited_parser(const pruftnet::parsing::RegistrySnapshotPtr& snapshot) {
    pruftnet::parsing::ParseBudget budget;
    budget.max_nodes = 1;
    return pruftnet::parsing::internal::PacketParser(snapshot, budget);
}

pruftnet::parsing::internal::PacketParser
source_limited_parser(const pruftnet::parsing::RegistrySnapshotPtr& snapshot) {
    pruftnet::parsing::ParseBudget budget;
    budget.max_source_bytes = 16;
    return pruftnet::parsing::internal::PacketParser(snapshot, budget);
}

pruftnet::parsing::internal::PacketParser
encoded_limited_parser(const pruftnet::parsing::RegistrySnapshotPtr& snapshot) {
    pruftnet::parsing::ParseBudget budget;
    budget.max_encoded_bytes = pruftnet::parsing::kParsedTreeEncodedOverhead +
                               sizeof(pruftnet::parsing::ParsedDataSource) + std::string_view("Captured frame").size() +
                               sizeof(pruftnet::parsing::ParsedFieldNode);
    return pruftnet::parsing::internal::PacketParser(snapshot, budget);
}

} // namespace

extern "C" int LLVMFuzzerTestOneInput(const std::uint8_t* data, std::size_t size) {
    static const auto snapshot = registry();
    static pruftnet::parsing::internal::PacketParser default_parser(snapshot);
    static auto node_parser = node_limited_parser(snapshot);
    static auto source_parser = source_limited_parser(snapshot);
    static auto encoded_parser = encoded_limited_parser(snapshot);
    const auto bounded_size = std::min<std::size_t>(size, 65'543);
    const auto control_size = std::min<std::size_t>(bounded_size, 8);
    const auto payload_size = bounded_size - control_size;
    const auto actual_size = control_size == 0 ? 0 : static_cast<std::size_t>(data[0]) % (payload_size + 1);
    const auto* payload_data = control_size == 0 ? data : data + control_size;
    const auto bytes = std::span<const std::byte>(reinterpret_cast<const std::byte*>(payload_data), actual_size);
    const auto captured_length =
        control_size < 2 ? actual_size : static_cast<std::size_t>(data[1]) % (payload_size + 32);
    const auto reported_length =
        control_size < 3 ? actual_size : static_cast<std::size_t>(data[2]) % (payload_size + 32);
    const auto link_type = control_size < 4 || (data[3] & 1U) == 0 ? 1U : static_cast<std::uint32_t>(data[3]);
    const auto packet = pruftnet::sniffing::RawPacketView{
        .metadata =
            {
                .key = {.capture_id = {.high = 1, .low = 2}, .packet_id = 1},
                .captured_len = static_cast<std::uint32_t>(captured_length),
                .wire_len = static_cast<std::uint32_t>(reported_length),
                .link_type = link_type,
                .flags = control_size >= 5 && (data[4] & 1U) != 0 ? pruftnet::sniffing::PacketFlagTruncated
                                                                  : pruftnet::sniffing::PacketFlagNone,
            },
        .bytes = bytes,
    };
    const auto selector = control_size < 6 ? 0 : data[5] % 4;
    auto& parser = selector == 1   ? node_parser
                   : selector == 2 ? source_parser
                   : selector == 3 ? encoded_parser
                                   : default_parser;
    try {
        auto tree = parser.parse(packet);
        if (tree.packet_key() != packet.metadata.key || tree.data_sources().size() != 1 || tree.nodes().empty()) {
            std::abort();
        }
        parser.recycle(std::move(tree));
    } catch (...) {
        std::abort();
    }
    return 0;
}

#if defined(PRUFTNET_STANDALONE_FUZZER)
int main(int argc, char** argv) {
    if (argc == 1) {
        const std::uint8_t seed[] = {0x00};
        return LLVMFuzzerTestOneInput(seed, sizeof(seed));
    }
    for (int index = 1; index < argc; ++index) {
        std::ifstream input(argv[index], std::ios::binary);
        std::vector<std::uint8_t> bytes((std::istreambuf_iterator<char>(input)), std::istreambuf_iterator<char>());
        LLVMFuzzerTestOneInput(bytes.data(), bytes.size());
    }
}
#endif

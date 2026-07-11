#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <fstream>
#include <iterator>
#include <span>
#include <variant>
#include <vector>

#include "pruftnet/parsing/packet_tree_codec.hpp"
#include "tests/support/packet_tree_fixture.hpp"

extern "C" int LLVMFuzzerTestOneInput(const std::uint8_t* data, std::size_t size) {
    size = std::min<std::size_t>(size, 128 * 1024 * 1024);
    const auto fixture = pruftnet::tests::make_packet_tree_fixture();
    const auto result = pruftnet::parsing::verify_packet_tree(
        std::span<const std::byte>(reinterpret_cast<const std::byte*>(data), size), *fixture.registry);
    if (const auto* tree = std::get_if<pruftnet::parsing::VerifiedPacketTreeView>(&result)) {
        (void)tree->checksum();
    }
    return 0;
}

#if defined(PRUFTNET_STANDALONE_FUZZER)
int main(int argc, char** argv) {
    if (argc <= 1) {
        const auto fixture = pruftnet::tests::make_packet_tree_fixture();
        pruftnet::parsing::PacketTreeEncoder encoder;
        const auto encoded = encoder.encode(fixture.tree);
        const auto* bytes = std::get_if<std::span<const std::byte>>(&encoded);
        return bytes == nullptr
                   ? 1
                   : LLVMFuzzerTestOneInput(reinterpret_cast<const std::uint8_t*>(bytes->data()), bytes->size());
    }
    for (int index = 1; index < argc; ++index) {
        std::ifstream input(argv[index], std::ios::binary);
        std::vector<std::uint8_t> bytes{std::istreambuf_iterator<char>(input), std::istreambuf_iterator<char>()};
        (void)LLVMFuzzerTestOneInput(bytes.data(), bytes.size());
    }
    return 0;
}
#endif

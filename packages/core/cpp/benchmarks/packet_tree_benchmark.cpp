#include <chrono>
#include <cstddef>
#include <cstdint>
#include <iostream>
#include <span>
#include <variant>

#include "pruftnet/parsing/packet_tree_codec.hpp"
#include "tests/support/packet_tree_fixture.hpp"

int main() {
    constexpr std::size_t iterations = 200'000;
    const auto fixture = pruftnet::tests::make_packet_tree_fixture();
    pruftnet::parsing::PacketTreeEncoder encoder;
    std::uint64_t checksum = 0;
    std::size_t encoded_size = 0;

    const auto started_at = std::chrono::steady_clock::now();
    for (std::size_t iteration = 0; iteration < iterations; ++iteration) {
        const auto encoded = encoder.encode(fixture.tree);
        const auto* bytes = std::get_if<std::span<const std::byte>>(&encoded);
        if (bytes == nullptr) {
            return 1;
        }
        const auto verified = pruftnet::parsing::verify_packet_tree(*bytes, *fixture.registry);
        const auto* tree = std::get_if<pruftnet::parsing::VerifiedPacketTreeView>(&verified);
        if (tree == nullptr) {
            return 1;
        }
        checksum += tree->checksum();
        encoded_size = bytes->size();
    }
    const auto elapsed = std::chrono::duration<double>(std::chrono::steady_clock::now() - started_at).count();
    std::cout << "packet_tree.iterations=" << iterations << '\n';
    std::cout << "packet_tree.encoded_bytes=" << encoded_size << '\n';
    std::cout << "packet_tree.encode_verify_per_second=" << static_cast<std::uint64_t>(iterations / elapsed) << '\n';
    std::cout << "packet_tree.checksum=" << checksum << '\n';
    return 0;
}

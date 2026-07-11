#include <array>
#include <chrono>
#include <cstddef>
#include <cstdint>
#include <iostream>
#include <memory>
#include <span>
#include <variant>

#include "parsing/packet_parser.hpp"
#include "pruftnet/parsing/packet_tree_codec.hpp"
#include "tests/support/ethernet_ipv4_udp_fixture.hpp"

int main() {
    auto registry_result = pruftnet::parsing::make_core_registry();
    auto* registry_value = std::get_if<pruftnet::parsing::RegistrySnapshot>(&registry_result);
    if (registry_value == nullptr) {
        return 1;
    }
    const auto registry = std::make_shared<const pruftnet::parsing::RegistrySnapshot>(std::move(*registry_value));
    constexpr std::array payload{std::byte{'h'}, std::byte{'e'}, std::byte{'l'}, std::byte{'l'}, std::byte{'o'}};
    const auto bytes = pruftnet::tests::ethernet_ipv4_udp_packet(payload);
    const auto raw = pruftnet::tests::raw_packet_view(bytes, bytes.size());
    pruftnet::parsing::internal::PacketParser parser(registry);
    constexpr std::size_t iterations = 200'000;
    std::uint64_t checksum = 0;

    auto started = std::chrono::steady_clock::now();
    for (std::size_t index = 0; index < iterations; ++index) {
        auto tree = parser.parse(raw);
        checksum += tree.nodes().size();
        parser.recycle(std::move(tree));
    }
    const auto parse_elapsed = std::chrono::steady_clock::now() - started;

    pruftnet::parsing::PacketTreeEncoder encoder;
    started = std::chrono::steady_clock::now();
    for (std::size_t index = 0; index < iterations; ++index) {
        auto tree = parser.parse(raw);
        const auto encoded_result = encoder.encode(tree);
        const auto* encoded = std::get_if<std::span<const std::byte>>(&encoded_result);
        if (encoded == nullptr) {
            return 1;
        }
        const auto verified_result = pruftnet::parsing::verify_packet_tree(*encoded, *registry);
        const auto* verified = std::get_if<pruftnet::parsing::VerifiedPacketTreeView>(&verified_result);
        if (verified == nullptr) {
            return 1;
        }
        checksum ^= verified->checksum();
        parser.recycle(std::move(tree));
    }
    const auto pipeline_elapsed = std::chrono::steady_clock::now() - started;
    const auto parse_seconds = std::chrono::duration<double>(parse_elapsed).count();
    const auto pipeline_seconds = std::chrono::duration<double>(pipeline_elapsed).count();
    std::cout << "packet_parser.iterations=" << iterations << '\n';
    std::cout << "packet_parser.frame_bytes=" << bytes.size() << '\n';
    std::cout << "packet_parser.parse_per_second=" << static_cast<std::uint64_t>(iterations / parse_seconds) << '\n';
    std::cout << "packet_parser.pipeline_per_second=" << static_cast<std::uint64_t>(iterations / pipeline_seconds)
              << '\n';
    std::cout << "packet_parser.checksum=" << checksum << '\n';
}

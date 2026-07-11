#include <array>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <memory>
#include <span>
#include <variant>

#include "parsing/packet_parser.hpp"
#include "pruftnet/parsing/packet_tree_codec.hpp"
#include "tests/support/ethernet_ipv4_udp_fixture.hpp"

int main(int argc, char** argv) {
    if (argc != 2) {
        std::cerr << "usage: parser_packet_tree_fixture_writer <output>\n";
        return 2;
    }
    auto registry_result = pruftnet::parsing::make_core_registry();
    auto* registry_value = std::get_if<pruftnet::parsing::RegistrySnapshot>(&registry_result);
    if (registry_value == nullptr) {
        return 1;
    }
    const auto registry = std::make_shared<const pruftnet::parsing::RegistrySnapshot>(std::move(*registry_value));
    constexpr std::array payload{std::byte{'h'}, std::byte{'e'}, std::byte{'l'}, std::byte{'l'}, std::byte{'o'}};
    const auto packet_bytes = pruftnet::tests::ethernet_ipv4_udp_packet(payload);
    pruftnet::parsing::internal::PacketParser parser(registry);
    const auto tree = parser.parse(pruftnet::tests::raw_packet_view(packet_bytes, packet_bytes.size()));

    pruftnet::parsing::PacketTreeEncoder encoder;
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

    std::ofstream stream(std::filesystem::path(argv[1]), std::ios::binary | std::ios::trunc);
    stream.write(reinterpret_cast<const char*>(encoded->data()), static_cast<std::streamsize>(encoded->size()));
    if (!stream) {
        return 1;
    }
    std::cout << "checksum=" << verified->checksum() << '\n';
    std::cout << "revision=" << registry->revision().value << '\n';
}

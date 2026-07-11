#include <filesystem>
#include <fstream>
#include <iostream>
#include <variant>

#include "pruftnet/parsing/packet_tree_codec.hpp"
#include "tests/support/packet_tree_fixture.hpp"

int main(int argc, char** argv) {
    if (argc != 2) {
        std::cerr << "usage: packet_tree_fixture_writer <output>\n";
        return 2;
    }

    const auto fixture = pruftnet::tests::make_packet_tree_fixture();
    pruftnet::parsing::PacketTreeEncoder encoder;
    const auto encoded_result = encoder.encode(fixture.tree);
    const auto* encoded = std::get_if<std::span<const std::byte>>(&encoded_result);
    if (encoded == nullptr) {
        return 1;
    }
    const auto verified_result = pruftnet::parsing::verify_packet_tree(*encoded, *fixture.registry);
    const auto* verified = std::get_if<pruftnet::parsing::VerifiedPacketTreeView>(&verified_result);
    if (verified == nullptr) {
        return 1;
    }

    const std::filesystem::path output(argv[1]);
    std::ofstream stream(output, std::ios::binary | std::ios::trunc);
    stream.write(reinterpret_cast<const char*>(encoded->data()), static_cast<std::streamsize>(encoded->size()));
    if (!stream) {
        return 1;
    }
    std::cout << "checksum=" << verified->checksum() << '\n';
    std::cout << "revision=" << fixture.registry->revision().value << '\n';
    return 0;
}

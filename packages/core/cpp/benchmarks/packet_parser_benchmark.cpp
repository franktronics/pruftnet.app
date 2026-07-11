#include <algorithm>
#include <array>
#include <chrono>
#include <cstddef>
#include <cstdint>
#include <iostream>
#include <memory>
#include <span>
#include <variant>
#include <vector>

#include "parsing/packet_parser.hpp"
#include "pruftnet/parsing/packet_tree_codec.hpp"
#include "tests/support/ethernet_ipv4_udp_fixture.hpp"

namespace {

std::vector<std::byte> ethernet(std::uint16_t type, std::span<const std::byte> payload) {
    std::vector<std::byte> bytes(14 + payload.size(), std::byte{0});
    bytes[12] = static_cast<std::byte>(type >> 8U);
    bytes[13] = static_cast<std::byte>(type & 0xffU);
    std::copy(payload.begin(), payload.end(), bytes.begin() + 14);
    return bytes;
}

std::vector<std::byte> ipv6(std::uint8_t next, std::span<const std::byte> payload) {
    std::vector<std::byte> packet(40 + payload.size(), std::byte{0});
    packet[0] = std::byte{0x60};
    packet[4] = static_cast<std::byte>(payload.size() >> 8U);
    packet[5] = static_cast<std::byte>(payload.size() & 0xffU);
    packet[6] = static_cast<std::byte>(next);
    packet[7] = std::byte{64};
    std::copy(payload.begin(), payload.end(), packet.begin() + 40);
    return ethernet(0x86dd, packet);
}

} // namespace

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

    std::array<std::vector<std::byte>, 4> mixed_bytes;
    std::array<std::byte, 28> arp{};
    arp[1] = std::byte{1};
    arp[2] = std::byte{0x08};
    arp[4] = std::byte{6};
    arp[5] = std::byte{4};
    arp[7] = std::byte{1};
    mixed_bytes[0] = ethernet(0x0806, arp);
    const std::array udp{std::byte{0}, std::byte{1}, std::byte{0}, std::byte{2},
                         std::byte{0}, std::byte{8}, std::byte{0}, std::byte{0}};
    mixed_bytes[1] = ipv6(17, udp);
    const std::array extended{std::byte{60}, std::byte{0}, std::byte{0}, std::byte{0}, std::byte{0}, std::byte{0},
                              std::byte{0}, std::byte{0}, std::byte{17}, std::byte{0}, std::byte{0}, std::byte{0},
                              std::byte{0}, std::byte{0}, std::byte{0}, std::byte{0}, std::byte{0}, std::byte{1},
                              std::byte{0}, std::byte{2}, std::byte{0}, std::byte{8}, std::byte{0}, std::byte{0}};
    mixed_bytes[2] = ipv6(0, extended);
    std::array<std::byte, 24> advertisement{};
    advertisement[0] = std::byte{134};
    advertisement[16] = std::byte{5};
    advertisement[17] = std::byte{1};
    mixed_bytes[3] = ipv6(58, advertisement);
    std::array<pruftnet::sniffing::RawPacketView, 4> mixed{
        pruftnet::tests::raw_packet_view(mixed_bytes[0], mixed_bytes[0].size()),
        pruftnet::tests::raw_packet_view(mixed_bytes[1], mixed_bytes[1].size()),
        pruftnet::tests::raw_packet_view(mixed_bytes[2], mixed_bytes[2].size()),
        pruftnet::tests::raw_packet_view(mixed_bytes[3], mixed_bytes[3].size()),
    };
    started = std::chrono::steady_clock::now();
    for (std::size_t index = 0; index < iterations; ++index) {
        auto tree = parser.parse(mixed[index % mixed.size()]);
        checksum += tree.nodes().size();
        parser.recycle(std::move(tree));
    }
    const auto mixed_elapsed = std::chrono::steady_clock::now() - started;
    const auto parse_seconds = std::chrono::duration<double>(parse_elapsed).count();
    const auto pipeline_seconds = std::chrono::duration<double>(pipeline_elapsed).count();
    const auto mixed_seconds = std::chrono::duration<double>(mixed_elapsed).count();
    std::cout << "packet_parser.iterations=" << iterations << '\n';
    std::cout << "packet_parser.frame_bytes=" << bytes.size() << '\n';
    std::cout << "packet_parser.parse_per_second=" << static_cast<std::uint64_t>(iterations / parse_seconds) << '\n';
    std::cout << "packet_parser.pipeline_per_second=" << static_cast<std::uint64_t>(iterations / pipeline_seconds)
              << '\n';
    std::cout << "packet_parser.mixed_per_second=" << static_cast<std::uint64_t>(iterations / mixed_seconds) << '\n';
    std::cout << "packet_parser.checksum=" << checksum << '\n';
}

#include <cstddef>
#include <cstdint>
#include <fstream>
#include <iterator>
#include <span>
#include <vector>

#include <pcap/pcap.h>

#include "pruftnet/sniffing/packet.hpp"
#include "sniffing/packet_parser.hpp"

extern "C" int LLVMFuzzerTestOneInput(const std::uint8_t* data, std::size_t size) {
    pruftnet::sniffing::PacketMetadata metadata;
    metadata.captured_len = static_cast<std::uint32_t>(size);
    metadata.wire_len = static_cast<std::uint32_t>(size);
    metadata.link_type = DLT_EN10MB;

    pruftnet::sniffing::RawPacketView raw_packet;
    raw_packet.metadata = metadata;
    raw_packet.bytes = std::span<const std::byte>(
        reinterpret_cast<const std::byte*>(data),
        size);

    pruftnet::sniffing::internal::PacketParser parser;
    (void)parser.parse(raw_packet);
    return 0;
}

#if defined(PRUFTNET_STANDALONE_FUZZER)
int main(int argc, char** argv) {
    if (argc <= 1) {
        const std::uint8_t seed[] = {0, 1, 2, 3};
        return LLVMFuzzerTestOneInput(seed, sizeof(seed));
    }

    for (int index = 1; index < argc; ++index) {
        std::ifstream input(argv[index], std::ios::binary);
        std::vector<std::uint8_t> bytes{
            std::istreambuf_iterator<char>(input),
            std::istreambuf_iterator<char>()};
        (void)LLVMFuzzerTestOneInput(bytes.data(), bytes.size());
    }
    return 0;
}
#endif

#pragma once

#include <cstddef>
#include <cstdint>
#include <iosfwd>

#include "pruftnet/capture/packet_sink.hpp"

namespace pruftnet::capture {

enum class RawPacketPrintMode {
    None,
    Summary,
    Hex,
};

struct RawPacketPrinterConfig {
    RawPacketPrintMode mode = RawPacketPrintMode::Summary;
    std::uint64_t print_every = 1;
    std::size_t bytes_to_print = 64;
    bool flush = false;
    std::ostream* output = nullptr;
};

class RawPacketPrinter final : public PacketSink {
public:
    explicit RawPacketPrinter(RawPacketPrinterConfig config);
    void on_packet(const PacketRecord& record, std::span<const std::byte> bytes) override;

private:
    RawPacketPrinterConfig config_;
    std::uint64_t received_ = 0;
};

} // namespace pruftnet::capture

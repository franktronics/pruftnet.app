#include "pruftnet/capture/raw_packet_printer.hpp"

#include <algorithm>
#include <cstddef>
#include <iomanip>
#include <iostream>
#include <ostream>

#include "pruftnet/capture/pcap_linktype.hpp"

namespace pruftnet::capture {

RawPacketPrinter::RawPacketPrinter(RawPacketPrinterConfig config) : config_(config) {
    if (config_.print_every == 0) {
        config_.print_every = 1;
    }

    if (config_.output == nullptr) {
        config_.output = &std::cout;
    }
}

void RawPacketPrinter::on_packet(const PacketRecord& record, std::span<const std::byte> bytes) {
    ++received_;

    if (config_.mode == RawPacketPrintMode::None || received_ % config_.print_every != 0) {
        return;
    }

    auto& output = *config_.output;
    output << '#' << record.sequence << " ts=" << record.timestamp_ns
           << " dlt=" << link_type_name(static_cast<int>(record.link_type))
           << " caplen=" << record.captured_len << " wirelen=" << record.wire_len
           << " flags=0x" << std::hex << record.flags << std::dec << '\n';

    if (config_.mode == RawPacketPrintMode::Hex) {
        const auto bytes_to_print = std::min(bytes.size(), config_.bytes_to_print);
        const auto old_flags = output.flags();
        const auto old_fill = output.fill();

        for (std::size_t index = 0; index < bytes_to_print; ++index) {
            if (index % 16 == 0) {
                output << "  " << std::setw(4) << std::setfill('0') << std::hex << index << ": ";
            }

            output << std::setw(2) << std::setfill('0') << std::hex
                   << static_cast<unsigned int>(std::to_integer<unsigned char>(bytes[index])) << ' ';

            if (index % 16 == 15 || index + 1 == bytes_to_print) {
                output << '\n';
            }
        }

        output.flags(old_flags);
        output.fill(old_fill);

        if (bytes.size() > bytes_to_print) {
            output << "  ... " << (bytes.size() - bytes_to_print) << " bytes not printed\n";
        }
    }

    if (config_.flush) {
        output.flush();
    }
}

} // namespace pruftnet::capture

#pragma once

#include <atomic>
#include <chrono>
#include <cstddef>
#include <cstdint>
#include <optional>
#include <string>
#include <thread>
#include <utility>
#include <variant>
#include <vector>

#include <pcap/pcap.h>

#include "pruftnet/sniffing/sniffer_error.hpp"
#include "pruftnet/sniffing/sniffer_event.hpp"
#include "sniffing/packet_source.hpp"

namespace pruftnet::tests {

struct FakePacket {
    std::vector<std::byte> bytes;
    std::uint32_t wire_length = 0;
    long timestamp_seconds = 1;
    long timestamp_subseconds = 0;
};

inline std::vector<std::byte> fake_packet_bytes(std::size_t length, std::uint8_t seed = 1) {
    std::vector<std::byte> bytes(length);
    for (std::size_t index = 0; index < bytes.size(); ++index) {
        bytes[index] = std::byte(static_cast<unsigned char>(seed + index));
    }
    return bytes;
}

inline FakePacket fake_packet(std::size_t captured_length, std::uint32_t wire_length = 0, std::uint8_t seed = 1) {
    FakePacket packet;
    packet.bytes = fake_packet_bytes(captured_length, seed);
    packet.wire_length = wire_length == 0 ? static_cast<std::uint32_t>(captured_length) : wire_length;
    return packet;
}

class FakePacketSource final : public pruftnet::sniffing::internal::PacketSource {
public:
    std::string name = "fake-packet-source";
    int configured_link_type = DLT_EN10MB;
    int configured_snapshot_length = 128;
    pruftnet::sniffing::internal::TimestampPrecision configured_timestamp_precision =
        pruftnet::sniffing::internal::TimestampPrecision::Microseconds;
    std::optional<pruftnet::sniffing::SnifferError> open_error;
    std::vector<pruftnet::sniffing::SnifferEvent> open_warnings;
    std::vector<FakePacket> packets;
    pruftnet::sniffing::internal::PacketSourceDispatchStatus after_packets_status =
        pruftnet::sniffing::internal::PacketSourceDispatchStatus::EndOfInput;
    int dispatch_error_status = PCAP_ERROR;
    std::string dispatch_error_message = "fake dispatch error";
    std::chrono::milliseconds no_packets_delay{0};
    bool stats_error = false;
    pruftnet::sniffing::internal::PcapKernelStats kernel_stats;

    pruftnet::sniffing::internal::PacketSourceOpenResult open() override {
        next_packet_ = 0;
        interrupted_.store(false, std::memory_order_release);
        is_open_ = true;

        if (open_error.has_value()) {
            return *open_error;
        }

        pruftnet::sniffing::internal::PacketSourceOpenSuccess success;
        success.warnings = open_warnings;
        return success;
    }

    void close() noexcept override { is_open_ = false; }

    void interrupt() noexcept override { interrupted_.store(true, std::memory_order_release); }

    [[nodiscard]] pruftnet::sniffing::internal::PacketSourceDispatchResult dispatch(
        int max_packets,
        pruftnet::sniffing::internal::PacketSourceCallback callback,
        void* user_data) noexcept override {
        if (!is_open_) {
            return {
                pruftnet::sniffing::internal::PacketSourceDispatchStatus::Error,
                0,
                PCAP_ERROR,
                "fake source is closed"};
        }

        if (interrupted_.load(std::memory_order_acquire)) {
            return {pruftnet::sniffing::internal::PacketSourceDispatchStatus::Interrupted, 0, PCAP_ERROR_BREAK, {}};
        }

        int emitted = 0;
        while (emitted < max_packets && next_packet_ < packets.size()) {
            const auto& packet = packets[next_packet_++];

            pcap_pkthdr header = {};
            header.ts.tv_sec = packet.timestamp_seconds;
            header.ts.tv_usec = packet.timestamp_subseconds;
            header.caplen = static_cast<bpf_u_int32>(packet.bytes.size());
            header.len = static_cast<bpf_u_int32>(packet.wire_length);

            if (callback != nullptr) {
                callback(user_data, header, reinterpret_cast<const unsigned char*>(packet.bytes.data()));
            }

            ++emitted;
            if (interrupted_.load(std::memory_order_acquire)) {
                break;
            }
        }

        if (emitted > 0) {
            return {pruftnet::sniffing::internal::PacketSourceDispatchStatus::PacketsRead, emitted, emitted, {}};
        }

        if (after_packets_status == pruftnet::sniffing::internal::PacketSourceDispatchStatus::NoPacketsAvailable &&
            no_packets_delay.count() > 0) {
            std::this_thread::sleep_for(no_packets_delay);
        }

        if (interrupted_.load(std::memory_order_acquire)) {
            return {pruftnet::sniffing::internal::PacketSourceDispatchStatus::Interrupted, 0, PCAP_ERROR_BREAK, {}};
        }

        if (after_packets_status == pruftnet::sniffing::internal::PacketSourceDispatchStatus::Error) {
            return {after_packets_status, 0, dispatch_error_status, dispatch_error_message};
        }

        return {after_packets_status, 0, 0, {}};
    }

    [[nodiscard]] int link_type() const noexcept override { return configured_link_type; }

    [[nodiscard]] int snapshot_length() const noexcept override { return configured_snapshot_length; }

    [[nodiscard]] pruftnet::sniffing::internal::TimestampPrecision timestamp_precision() const noexcept override {
        return configured_timestamp_precision;
    }

    [[nodiscard]] std::variant<pruftnet::sniffing::internal::PcapKernelStats, pruftnet::sniffing::SnifferError>
    read_stats() const override {
        if (stats_error) {
            return pruftnet::sniffing::make_sniffer_error(
                pruftnet::sniffing::SnifferErrorCode::StatsReadFailed,
                pruftnet::sniffing::SnifferSeverity::Warning,
                "fake stats error",
                name,
                0,
                {},
                true);
        }

        return kernel_stats;
    }

    [[nodiscard]] std::string source_name() const override { return name; }

private:
    std::size_t next_packet_ = 0;
    bool is_open_ = false;
    std::atomic<bool> interrupted_{false};
};

} // namespace pruftnet::tests

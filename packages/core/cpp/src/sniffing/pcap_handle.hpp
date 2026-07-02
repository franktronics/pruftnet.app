#pragma once

#include <cstdint>
#include <string>
#include <variant>

#include <pcap/pcap.h>

#include "pruftnet/sniffing/sniffer_error.hpp"

namespace pruftnet::sniffing::internal {

enum class TimestampPrecision {
    Microseconds,
    Nanoseconds,
};

struct PcapKernelStats {
    std::uint64_t recv = 0;
    std::uint64_t drop = 0;
    std::uint64_t ifdrop = 0;
};

class PcapHandle {
public:
    PcapHandle() = default;
    PcapHandle(pcap_t* handle, TimestampPrecision timestamp_precision, int link_type, int snapshot_length);
    ~PcapHandle();

    PcapHandle(const PcapHandle&) = delete;
    PcapHandle& operator=(const PcapHandle&) = delete;
    PcapHandle(PcapHandle&& other) noexcept;
    PcapHandle& operator=(PcapHandle&& other) noexcept;

    void reset() noexcept;
    void reset(pcap_t* handle, TimestampPrecision timestamp_precision, int link_type, int snapshot_length) noexcept;

    [[nodiscard]] bool valid() const noexcept;
    [[nodiscard]] pcap_t* raw() const noexcept;
    [[nodiscard]] int link_type() const noexcept;
    [[nodiscard]] int snapshot_length() const noexcept;
    [[nodiscard]] TimestampPrecision timestamp_precision() const noexcept;
    [[nodiscard]] std::string last_error() const;

    [[nodiscard]] int dispatch(int packet_count, pcap_handler callback, unsigned char* user_data) noexcept;
    void break_loop() noexcept;
    [[nodiscard]] std::variant<PcapKernelStats, SnifferError> read_stats(const std::string& source_name) const;

private:
    pcap_t* handle_ = nullptr;
    TimestampPrecision timestamp_precision_ = TimestampPrecision::Microseconds;
    int link_type_ = 0;
    int snapshot_length_ = 0;
};

std::string pcap_status_to_string(int status);

} // namespace pruftnet::sniffing::internal

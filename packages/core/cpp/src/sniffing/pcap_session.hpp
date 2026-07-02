#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <variant>
#include <vector>

#include <pcap/pcap.h>

#include "pruftnet/sniffing/sniffer_error.hpp"
#include "pruftnet/sniffing/sniffer_event.hpp"
#include "pruftnet/sniffing/sniffer_options.hpp"

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

class PcapSession {
public:
    PcapSession() = default;
    explicit PcapSession(pcap_t* handle, TimestampPrecision timestamp_precision, int link_type);
    ~PcapSession();

    PcapSession(const PcapSession&) = delete;
    PcapSession& operator=(const PcapSession&) = delete;
    PcapSession(PcapSession&& other) noexcept;
    PcapSession& operator=(PcapSession&& other) noexcept;

    [[nodiscard]] bool valid() const noexcept;
    [[nodiscard]] int link_type() const noexcept;
    [[nodiscard]] TimestampPrecision timestamp_precision() const noexcept;
    [[nodiscard]] std::string last_error() const;

    int dispatch(int packet_count, pcap_handler callback, unsigned char* user_data) noexcept;
    void break_loop() noexcept;
    std::variant<PcapKernelStats, SnifferError> read_stats(const std::string& interface_name) const;

private:
    pcap_t* handle_ = nullptr;
    TimestampPrecision timestamp_precision_ = TimestampPrecision::Microseconds;
    int link_type_ = 0;
};

struct PcapOpenSuccess {
    PcapSession session;
    std::vector<SnifferEvent> warnings;
};

using PcapOpenResult = std::variant<PcapOpenSuccess, SnifferError>;

PcapOpenResult open_pcap_session(const SnifferOptions& options);
std::string pcap_status_to_string(int status);

} // namespace pruftnet::sniffing::internal

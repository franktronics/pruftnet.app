#pragma once

#include <cstdint>
#include <optional>
#include <string>
#include <variant>
#include <vector>

#include <pcap/pcap.h>

#include "pruftnet/capture/capture_config.hpp"
#include "pruftnet/capture/capture_error.hpp"
#include "pruftnet/capture/capture_event.hpp"

namespace pruftnet::capture {

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
    explicit PcapHandle(pcap_t* handle, TimestampPrecision timestamp_precision, int link_type);
    ~PcapHandle();

    PcapHandle(const PcapHandle&) = delete;
    PcapHandle& operator=(const PcapHandle&) = delete;

    PcapHandle(PcapHandle&& other) noexcept;
    PcapHandle& operator=(PcapHandle&& other) noexcept;

    [[nodiscard]] pcap_t* get() const noexcept;
    [[nodiscard]] bool valid() const noexcept;
    [[nodiscard]] int link_type() const noexcept;
    [[nodiscard]] TimestampPrecision timestamp_precision() const noexcept;
    [[nodiscard]] std::string last_error() const;

    int dispatch(int packet_count, pcap_handler callback, unsigned char* user_data) noexcept;
    void break_loop() noexcept;

    std::variant<PcapKernelStats, CaptureError> read_stats(const std::string& interface_name) const;

private:
    pcap_t* handle_ = nullptr;
    TimestampPrecision timestamp_precision_ = TimestampPrecision::Microseconds;
    int link_type_ = 0;
};

struct PcapOpenSuccess {
    PcapHandle handle;
    std::vector<CaptureEvent> warnings;
};

using PcapOpenResult = std::variant<PcapOpenSuccess, CaptureError>;

PcapOpenResult open_pcap_handle(const CaptureConfig& config);
std::string pcap_status_to_string(int status);

} // namespace pruftnet::capture

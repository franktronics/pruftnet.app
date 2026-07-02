#pragma once

#include <string>
#include <variant>
#include <vector>

#include <pcap/pcap.h>

#include "pruftnet/sniffing/sniffer_error.hpp"
#include "pruftnet/sniffing/sniffer_event.hpp"
#include "sniffing/pcap_handle.hpp"

namespace pruftnet::sniffing::internal {

enum class PacketSourceDispatchStatus {
    PacketsRead,
    NoPacketsAvailable,
    EndOfInput,
    Interrupted,
    Error,
};

struct PacketSourceDispatchResult {
    PacketSourceDispatchStatus status = PacketSourceDispatchStatus::NoPacketsAvailable;
    int packet_count = 0;
    int pcap_status = 0;
    std::string error_message;
};

using PacketSourceCallback = void (*)(void* user_data, const pcap_pkthdr& header, const unsigned char* bytes) noexcept;

struct PacketSourceDispatchContext {
    PacketSourceCallback callback = nullptr;
    void* user_data = nullptr;
};

struct PacketSourceOpenSuccess {
    std::vector<SnifferEvent> warnings;
};

using PacketSourceOpenResult = std::variant<PacketSourceOpenSuccess, SnifferError>;

class PacketSource {
public:
    virtual ~PacketSource() = default;

    virtual PacketSourceOpenResult open() = 0;
    virtual void close() noexcept = 0;
    virtual void interrupt() noexcept = 0;

    [[nodiscard]] virtual PacketSourceDispatchResult dispatch(
        int max_packets,
        PacketSourceCallback callback,
        void* user_data) noexcept = 0;

    [[nodiscard]] virtual int link_type() const noexcept = 0;
    [[nodiscard]] virtual int snapshot_length() const noexcept = 0;
    [[nodiscard]] virtual TimestampPrecision timestamp_precision() const noexcept = 0;
    [[nodiscard]] virtual std::variant<PcapKernelStats, SnifferError> read_stats() const = 0;
    [[nodiscard]] virtual std::string source_name() const = 0;
};

void packet_source_pcap_trampoline(
    unsigned char* user_data,
    const pcap_pkthdr* header,
    const unsigned char* bytes) noexcept;

} // namespace pruftnet::sniffing::internal

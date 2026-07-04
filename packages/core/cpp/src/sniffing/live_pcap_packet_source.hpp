#pragma once

#include <string>

#include "pruftnet/sniffing/sniffer_options.hpp"
#include "sniffing/packet_source.hpp"
#include "sniffing/pcap_handle.hpp"

namespace pruftnet::sniffing::internal {

class LivePcapPacketSource final : public PacketSource {
public:
    explicit LivePcapPacketSource(SnifferInterfaceOptions options);
    ~LivePcapPacketSource() override = default;

    PacketSourceOpenResult open() override;
    void close() noexcept override;
    void interrupt() noexcept override;

    [[nodiscard]] PacketSourceDispatchResult dispatch(
        int max_packets,
        PacketSourceCallback callback,
        void* user_data) noexcept override;

    [[nodiscard]] int link_type() const noexcept override;
    [[nodiscard]] int snapshot_length() const noexcept override;
    [[nodiscard]] TimestampPrecision timestamp_precision() const noexcept override;
    [[nodiscard]] std::variant<PcapKernelStats, SnifferError> read_stats() const override;
    [[nodiscard]] std::string source_name() const override;

private:
    SnifferInterfaceOptions options_;
    PcapHandle handle_;
};

} // namespace pruftnet::sniffing::internal

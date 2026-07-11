#pragma once

#include <functional>
#include <memory>
#include <optional>

#include "pruftnet/parsing/registry.hpp"
#include "pruftnet/sniffing/packet.hpp"
#include "pruftnet/sniffing/parsed_packet.hpp"
#include "pruftnet/sniffing/sniffer_error.hpp"
#include "pruftnet/sniffing/sniffer_event.hpp"
#include "pruftnet/sniffing/sniffer_options.hpp"
#include "pruftnet/sniffing/sniffer_stats.hpp"

namespace pruftnet::sniffing {

using PacketCallback = std::function<void(
    const RawPacketView& raw_packet,
    const ParsedPacket& parsed_packet)>;

class NetworkSniffer {
public:
    NetworkSniffer(SnifferOptions options, PacketCallback packet_callback, EventCallback event_callback = {});
    ~NetworkSniffer();

    NetworkSniffer(const NetworkSniffer&) = delete;
    NetworkSniffer& operator=(const NetworkSniffer&) = delete;
    NetworkSniffer(NetworkSniffer&&) noexcept;
    NetworkSniffer& operator=(NetworkSniffer&&) noexcept;

    std::optional<SnifferError> start();
    void stop() noexcept;
    [[nodiscard]] bool is_running() const noexcept;
    [[nodiscard]] std::optional<CaptureId> capture_id() const;
    [[nodiscard]] parsing::RegistryRevision registry_revision() const noexcept;
    [[nodiscard]] SnifferStatsSnapshot stats() const;

private:
    class Impl;
    std::unique_ptr<Impl> impl_;
};

} // namespace pruftnet::sniffing

#include "pruftnet/sniffing/network_sniffer.hpp"

#include <memory>
#include <utility>

#include "sniffing/live_pcap_packet_source.hpp"
#include "sniffing/sniffer_runtime.hpp"

namespace pruftnet::sniffing {

class NetworkSniffer::Impl {
public:
    Impl(SnifferOptions options, PacketCallback packet_callback, EventCallback event_callback) {
        auto source_options = options;
        runtime_ = std::make_unique<internal::SnifferRuntime>(
            std::move(options),
            std::make_unique<internal::LivePcapPacketSource>(std::move(source_options)),
            internal::SnifferOptionsValidation{.require_interface_name = true},
            std::move(packet_callback),
            std::move(event_callback));
    }

    ~Impl() = default;

    std::optional<SnifferError> start() { return runtime_->start(); }

    void stop() noexcept { runtime_->stop(); }

    bool is_running() const noexcept { return runtime_->is_running(); }

    SnifferStatsSnapshot stats() const noexcept { return runtime_->stats(); }

private:
    std::unique_ptr<internal::SnifferRuntime> runtime_;
};

NetworkSniffer::NetworkSniffer(
    SnifferOptions options,
    PacketCallback packet_callback,
    EventCallback event_callback)
    : impl_(std::make_unique<Impl>(
          std::move(options),
          std::move(packet_callback),
          std::move(event_callback))) {}

NetworkSniffer::~NetworkSniffer() = default;

NetworkSniffer::NetworkSniffer(NetworkSniffer&&) noexcept = default;

NetworkSniffer& NetworkSniffer::operator=(NetworkSniffer&&) noexcept = default;

std::optional<SnifferError> NetworkSniffer::start() { return impl_->start(); }

void NetworkSniffer::stop() noexcept { impl_->stop(); }

bool NetworkSniffer::is_running() const noexcept { return impl_->is_running(); }

SnifferStatsSnapshot NetworkSniffer::stats() const noexcept { return impl_->stats(); }

} // namespace pruftnet::sniffing

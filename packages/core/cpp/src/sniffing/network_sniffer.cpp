#include "pruftnet/sniffing/network_sniffer.hpp"

#include <memory>
#include <utility>
#include <vector>

#include "sniffing/live_pcap_packet_source.hpp"
#include "sniffing/sniffer_runtime.hpp"

namespace pruftnet::sniffing {

class NetworkSniffer::Impl {
public:
    Impl(SnifferOptions options, PacketCallback packet_callback, EventCallback event_callback) {
        std::vector<std::unique_ptr<internal::PacketSource>> sources;
        sources.reserve(options.interfaces.size());
        for (std::size_t index = 0; index < options.interfaces.size(); ++index) {
            auto interface_options = options.interfaces[index];
            if (interface_options.id == kAutoInterfaceId) {
                interface_options.id = static_cast<std::uint32_t>(index);
                options.interfaces[index].id = interface_options.id;
            }

            sources.push_back(std::make_unique<internal::LivePcapPacketSource>(std::move(interface_options)));
        }

        runtime_ = std::make_unique<internal::SnifferRuntime>(
            std::move(options),
            std::move(sources),
            internal::SnifferOptionsValidation{.require_interface_name = true},
            std::move(packet_callback),
            std::move(event_callback));
    }

    ~Impl() = default;

    std::optional<SnifferError> start() { return runtime_->start(); }

    void stop() noexcept { runtime_->stop(); }

    bool is_running() const noexcept { return runtime_->is_running(); }

    std::optional<CaptureId> capture_id() const { return runtime_->capture_id(); }

    SnifferStatsSnapshot stats() const { return runtime_->stats(); }

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

std::optional<CaptureId> NetworkSniffer::capture_id() const { return impl_->capture_id(); }

SnifferStatsSnapshot NetworkSniffer::stats() const { return impl_->stats(); }

} // namespace pruftnet::sniffing

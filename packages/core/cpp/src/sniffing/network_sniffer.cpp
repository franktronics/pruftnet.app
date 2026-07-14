#include "pruftnet/sniffing/network_sniffer.hpp"

#include <memory>
#include <utility>
#include <vector>

#include "sniffing/live_pcap_packet_source.hpp"
#include "sniffing/offline_pcap_packet_source.hpp"
#include "sniffing/sniffer_runtime.hpp"

namespace pruftnet::sniffing {

class NetworkSniffer::Impl {
public:
  Impl(SnifferOptions options, PacketCallback packet_callback,
       EventCallback event_callback) {
    std::vector<std::unique_ptr<internal::PacketSource>> sources;
    sources.reserve(options.interfaces.size());
    for (std::size_t index = 0; index < options.interfaces.size(); ++index) {
      auto interface_options = options.interfaces[index];
      if (interface_options.id == kAutoInterfaceId) {
        interface_options.id = static_cast<std::uint32_t>(index);
        options.interfaces[index].id = interface_options.id;
      }

      sources.push_back(std::make_unique<internal::LivePcapPacketSource>(
          std::move(interface_options)));
    }

    runtime_ = std::make_unique<internal::SnifferRuntime>(
        std::move(options), std::move(sources),
        internal::SnifferOptionsValidation{.require_interface_name = true},
        std::move(packet_callback), std::move(event_callback));
  }

  Impl(std::string path, SnifferOptions options, PacketCallback packet_callback,
       EventCallback event_callback) {
    if (options.interfaces.empty()) {
      options.interfaces.emplace_back();
    }
    auto interface_options = options.interfaces.front();
    if (interface_options.id == kAutoInterfaceId) {
      interface_options.id = 0;
      options.interfaces.front().id = 0;
    }
    std::vector<std::unique_ptr<internal::PacketSource>> sources;
    sources.push_back(std::make_unique<internal::OfflinePcapPacketSource>(
        std::move(path), interface_options));
    options.interfaces.resize(1);
    runtime_ = std::make_unique<internal::SnifferRuntime>(
        std::move(options), std::move(sources),
        internal::SnifferOptionsValidation{.require_interface_name = false},
        std::move(packet_callback), std::move(event_callback));
  }

  ~Impl() = default;

  std::optional<SnifferError> start() { return runtime_->start(); }

  void stop() noexcept { runtime_->stop(); }

  bool is_running() const noexcept { return runtime_->is_running(); }

  std::optional<CaptureId> capture_id() const { return runtime_->capture_id(); }

  parsing::RegistryRevision registry_revision() const noexcept {
    return runtime_->registry_revision();
  }
  parsing::RegistrySnapshotPtr registry_snapshot() const noexcept {
    return runtime_->registry_snapshot();
  }

  SnifferStatsSnapshot stats() const { return runtime_->stats(); }
  capture::PacketSpoolLookup persisted_packet(const PacketKey &key) const {
    return runtime_->persisted_packet(key);
  }
  std::vector<std::filesystem::path> spool_paths() const {
    return runtime_->spool_paths();
  }
  std::vector<capture::PcapngSegmentSnapshot> spool_segments() const {
    return runtime_->spool_segments();
  }
  std::vector<capture::PcapngSegmentSnapshot> lease_spool_snapshot() {
    return runtime_->lease_spool_snapshot();
  }
  void
  release_spool_leases(std::span<const std::uint64_t> segment_ids) noexcept {
    runtime_->release_spool_leases(segment_ids);
  }

private:
  std::unique_ptr<internal::SnifferRuntime> runtime_;
};

NetworkSniffer::NetworkSniffer(SnifferOptions options,
                               PacketCallback packet_callback,
                               EventCallback event_callback)
    : impl_(std::make_unique<Impl>(std::move(options),
                                   std::move(packet_callback),
                                   std::move(event_callback))) {}

NetworkSniffer::NetworkSniffer(OfflineTag, std::string path,
                               SnifferOptions options,
                               PacketCallback packet_callback,
                               EventCallback event_callback)
    : impl_(std::make_unique<Impl>(std::move(path), std::move(options),
                                   std::move(packet_callback),
                                   std::move(event_callback))) {}

NetworkSniffer NetworkSniffer::offline(std::string path, SnifferOptions options,
                                       PacketCallback packet_callback,
                                       EventCallback event_callback) {
  return NetworkSniffer(OfflineTag{}, std::move(path), std::move(options),
                        std::move(packet_callback), std::move(event_callback));
}

NetworkSniffer::~NetworkSniffer() = default;

NetworkSniffer::NetworkSniffer(NetworkSniffer &&) noexcept = default;

NetworkSniffer &NetworkSniffer::operator=(NetworkSniffer &&) noexcept = default;

std::optional<SnifferError> NetworkSniffer::start() { return impl_->start(); }

void NetworkSniffer::stop() noexcept { impl_->stop(); }

bool NetworkSniffer::is_running() const noexcept { return impl_->is_running(); }

std::optional<CaptureId> NetworkSniffer::capture_id() const {
  return impl_->capture_id();
}

parsing::RegistryRevision NetworkSniffer::registry_revision() const noexcept {
  return impl_->registry_revision();
}
parsing::RegistrySnapshotPtr
NetworkSniffer::registry_snapshot() const noexcept {
  return impl_->registry_snapshot();
}

SnifferStatsSnapshot NetworkSniffer::stats() const { return impl_->stats(); }

capture::PacketSpoolLookup
NetworkSniffer::persisted_packet(const PacketKey &key) const {
  return impl_->persisted_packet(key);
}

std::vector<std::filesystem::path> NetworkSniffer::spool_paths() const {
  return impl_->spool_paths();
}

std::vector<capture::PcapngSegmentSnapshot>
NetworkSniffer::spool_segments() const {
  return impl_->spool_segments();
}

std::vector<capture::PcapngSegmentSnapshot>
NetworkSniffer::lease_spool_snapshot() {
  return impl_->lease_spool_snapshot();
}

void NetworkSniffer::release_spool_leases(
    std::span<const std::uint64_t> segment_ids) noexcept {
  impl_->release_spool_leases(segment_ids);
}

} // namespace pruftnet::sniffing

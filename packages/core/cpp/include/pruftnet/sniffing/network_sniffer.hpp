#pragma once

#include <functional>
#include <filesystem>
#include <memory>
#include <optional>
#include <string>

#include "pruftnet/parsing/registry.hpp"
#include "pruftnet/capture/pcapng_spool.hpp"
#include "pruftnet/sniffing/packet.hpp"
#include "pruftnet/sniffing/parsed_packet.hpp"
#include "pruftnet/sniffing/sniffer_error.hpp"
#include "pruftnet/sniffing/sniffer_event.hpp"
#include "pruftnet/sniffing/sniffer_options.hpp"
#include "pruftnet/sniffing/sniffer_stats.hpp"

namespace pruftnet::sniffing {

// Both references expire when the callback returns. ParsedPacket owns its
// arenas, so callers that need retention may copy or move a copy into their own
// storage.
using PacketCallback = std::function<void(const RawPacketView &raw_packet,
                                          const ParsedPacket &parsed_packet)>;

class NetworkSniffer {
public:
  NetworkSniffer(SnifferOptions options, PacketCallback packet_callback,
                 EventCallback event_callback = {});
  [[nodiscard]] static NetworkSniffer
  offline(std::string path, SnifferOptions options,
          PacketCallback packet_callback, EventCallback event_callback = {});
  ~NetworkSniffer();

  NetworkSniffer(const NetworkSniffer &) = delete;
  NetworkSniffer &operator=(const NetworkSniffer &) = delete;
  NetworkSniffer(NetworkSniffer &&) noexcept;
  NetworkSniffer &operator=(NetworkSniffer &&) noexcept;

  std::optional<SnifferError> start();
  void stop() noexcept;
  [[nodiscard]] bool is_running() const noexcept;
  [[nodiscard]] std::optional<CaptureId> capture_id() const;
  [[nodiscard]] parsing::RegistryRevision registry_revision() const noexcept;
  [[nodiscard]] parsing::RegistrySnapshotPtr registry_snapshot() const noexcept;
  [[nodiscard]] SnifferStatsSnapshot stats() const;
  [[nodiscard]] capture::PacketSpoolLookup
  persisted_packet(const PacketKey &key) const;
  [[nodiscard]] std::vector<std::filesystem::path> spool_paths() const;

private:
  struct OfflineTag {};
  NetworkSniffer(OfflineTag, std::string path, SnifferOptions options,
                 PacketCallback packet_callback, EventCallback event_callback);
  class Impl;
  std::unique_ptr<Impl> impl_;
};

} // namespace pruftnet::sniffing

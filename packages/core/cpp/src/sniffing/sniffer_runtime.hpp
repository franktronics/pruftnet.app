#pragma once

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <memory>
#include <mutex>
#include <optional>
#include <thread>
#include <vector>

#include "parsing/packet_parser.hpp"
#include "pruftnet/capture/pcapng_spool.hpp"
#include "pruftnet/parsing/registry.hpp"
#include "pruftnet/sniffing/network_sniffer.hpp"
#include "pruftnet/sniffing/sniffer_error.hpp"
#include "pruftnet/sniffing/sniffer_event.hpp"
#include "pruftnet/sniffing/sniffer_options.hpp"
#include "pruftnet/sniffing/sniffer_stats.hpp"
#include "sniffing/internal_stats.hpp"
#include "sniffing/packet_ring.hpp"
#include "sniffing/packet_source.hpp"
#include "sniffing/sniffer_options_validation.hpp"

namespace pruftnet::sniffing::internal {

class SnifferRuntime {
public:
  SnifferRuntime(SnifferOptions options,
                 std::vector<std::unique_ptr<PacketSource>> packet_sources,
                 SnifferOptionsValidation validation,
                 PacketCallback packet_callback, EventCallback event_callback,
                 capture::SpoolSinkFactory spool_sink_factory = {});
  ~SnifferRuntime();

  SnifferRuntime(const SnifferRuntime &) = delete;
  SnifferRuntime &operator=(const SnifferRuntime &) = delete;

  [[nodiscard]] std::optional<SnifferError> start();
  void stop() noexcept;
  [[nodiscard]] bool is_running() const noexcept;
  [[nodiscard]] std::optional<CaptureId> capture_id() const;
  [[nodiscard]] parsing::RegistryRevision registry_revision() const noexcept;
  [[nodiscard]] parsing::RegistrySnapshotPtr
  registry_snapshot() const noexcept {
    return registry_;
  }
  [[nodiscard]] SnifferStatsSnapshot stats() const;
  [[nodiscard]] capture::PacketSpoolLookup
  persisted_packet(const PacketKey &key) const;
  [[nodiscard]] std::vector<std::filesystem::path> spool_paths() const;

private:
  struct InterfaceCaptureContext;

  static void packet_source_callback(void *user_data, const pcap_pkthdr &header,
                                     const unsigned char *bytes) noexcept;

  [[nodiscard]] std::optional<SnifferError> validate_start_options() const;
  [[nodiscard]] std::optional<SnifferError>
  open_and_prepare_sources(std::vector<SnifferEvent> &startup_events);
  void close_sources() noexcept;
  void request_stop() noexcept;
  void join_threads() noexcept;
  [[nodiscard]] bool has_joinable_threads() const noexcept;
  void mark_unstarted_captures_done() noexcept;
  [[nodiscard]] bool wait_for_start_gate() noexcept;
  void release_start_gate(bool success) noexcept;
  void notify_writer() noexcept;
  void notify_analyzer() noexcept;
  void capture_loop(InterfaceCaptureContext &context) noexcept;
  void writer_loop() noexcept;
  void analyzer_loop() noexcept;
  void publish_committed(const std::vector<capture::CommittedPacket> &packets) noexcept;
  void fail_spool(const capture::SpoolError &error) noexcept;
  void account_unwritten_queues() noexcept;
  void handle_packet(InterfaceCaptureContext &context,
                     const pcap_pkthdr &header,
                     const unsigned char *bytes) noexcept;
  void update_kernel_stats_if_due(InterfaceCaptureContext &context) noexcept;
  void update_kernel_stats(InterfaceCaptureContext &context) noexcept;
  [[nodiscard]] bool all_capture_done() const noexcept;
  [[nodiscard]] bool any_ring_has_packets() const noexcept;
  void emit_event(const SnifferEvent &event) const noexcept;
  void emit_error(const SnifferError &error) const noexcept;
  [[nodiscard]] SnifferEvent
  with_interface_context(const SnifferEvent &event,
                         const InterfaceCaptureContext &context) const;
  [[nodiscard]] SnifferError
  with_interface_context(SnifferError error,
                         const InterfaceCaptureContext &context) const;

  parsing::RegistrySnapshotPtr registry_;
  parsing::internal::DissectorCatalogPtr catalog_;
  SnifferOptions options_;
  std::vector<std::unique_ptr<InterfaceCaptureContext>> interfaces_;
  std::size_t packet_source_count_ = 0;
  SnifferOptionsValidation validation_;
  PacketCallback packet_callback_;
  EventCallback event_callback_;
  capture::SpoolSinkFactory spool_sink_factory_;
  mutable std::mutex lifecycle_mutex_;
  mutable std::mutex capture_id_mutex_;
  std::mutex start_gate_mutex_;
  std::condition_variable lifecycle_condition_;
  std::condition_variable start_gate_condition_;
  parsing::internal::PacketParser parser_;
  std::unique_ptr<capture::PcapngSpool> spool_;
  std::thread writer_thread_;
  std::thread analyzer_thread_;
  std::atomic<bool> running_{false};
  std::atomic<bool> stop_requested_{false};
  std::atomic<bool> writer_thread_running_{false};
  std::atomic<bool> analyzer_running_{false};
  std::atomic<bool> writer_done_{false};
  std::atomic<bool> spool_failed_{false};
  std::optional<CaptureId> capture_id_;
  CaptureId active_capture_id_;
  bool start_gate_released_ = false;
  bool start_gate_success_ = false;
  bool stopping_ = false;
  std::atomic<PacketId> next_packet_id_{1};
  std::atomic<std::uint64_t> writer_wakeup_generation_{0};
  std::atomic<std::uint64_t> analyzer_wakeup_generation_{0};
  std::atomic<std::uint64_t> packets_available_for_analysis_{0};
  std::atomic<std::uint64_t> packets_analyzed_{0};
  std::atomic<std::uint64_t> analysis_backlog_bytes_{0};
  std::atomic<std::uint64_t> analysis_errors_{0};
  std::atomic<std::uint64_t> analysis_resource_limits_{0};
  std::atomic<std::uint64_t> analysis_gap_count_{0};
  std::atomic<std::uint64_t> analysis_evicted_before_analysis_{0};
  std::atomic<std::uint64_t> analysis_rejects_{0};
  std::atomic<std::uint64_t> writer_in_flight_{0};
  std::atomic<std::uint64_t> terminal_write_losses_{0};
};

} // namespace pruftnet::sniffing::internal

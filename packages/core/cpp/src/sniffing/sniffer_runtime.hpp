#pragma once

#include <atomic>
#include <chrono>
#include <condition_variable>
#include <memory>
#include <mutex>
#include <optional>
#include <thread>
#include <vector>

#include "pruftnet/sniffing/network_sniffer.hpp"
#include "pruftnet/sniffing/sniffer_error.hpp"
#include "pruftnet/sniffing/sniffer_event.hpp"
#include "pruftnet/sniffing/sniffer_options.hpp"
#include "pruftnet/sniffing/sniffer_stats.hpp"
#include "sniffing/empty_packet_parser.hpp"
#include "sniffing/internal_stats.hpp"
#include "sniffing/packet_ring.hpp"
#include "sniffing/packet_source.hpp"
#include "sniffing/sniffer_options_validation.hpp"

namespace pruftnet::sniffing::internal {

class SnifferRuntime {
public:
    SnifferRuntime(
        SnifferOptions options,
        std::vector<std::unique_ptr<PacketSource>> packet_sources,
        SnifferOptionsValidation validation,
        PacketCallback packet_callback,
        EventCallback event_callback);
    ~SnifferRuntime();

    SnifferRuntime(const SnifferRuntime&) = delete;
    SnifferRuntime& operator=(const SnifferRuntime&) = delete;

    [[nodiscard]] std::optional<SnifferError> start();
    void stop() noexcept;
    [[nodiscard]] bool is_running() const noexcept;
    [[nodiscard]] SnifferStatsSnapshot stats() const;

private:
    struct InterfaceCaptureContext;

    static void packet_source_callback(void* user_data, const pcap_pkthdr& header, const unsigned char* bytes) noexcept;

    [[nodiscard]] std::optional<SnifferError> validate_start_options() const;
    [[nodiscard]] std::optional<SnifferError> open_and_prepare_sources();
    void close_sources() noexcept;
    void request_stop() noexcept;
    void join_threads() noexcept;
    void mark_unstarted_captures_done() noexcept;
    void capture_loop(InterfaceCaptureContext& context) noexcept;
    void parser_loop() noexcept;
    void handle_packet(InterfaceCaptureContext& context, const pcap_pkthdr& header, const unsigned char* bytes) noexcept;
    void update_kernel_stats_if_due(InterfaceCaptureContext& context) noexcept;
    [[nodiscard]] bool all_capture_done() const noexcept;
    [[nodiscard]] bool any_ring_has_packets() const noexcept;
    void emit_event(const SnifferEvent& event) const noexcept;
    void emit_error(const SnifferError& error) const noexcept;
    [[nodiscard]] SnifferEvent with_interface_context(
        const SnifferEvent& event,
        const InterfaceCaptureContext& context) const;
    [[nodiscard]] SnifferError with_interface_context(
        SnifferError error,
        const InterfaceCaptureContext& context) const;

    SnifferOptions options_;
    std::vector<std::unique_ptr<InterfaceCaptureContext>> interfaces_;
    std::size_t packet_source_count_ = 0;
    SnifferOptionsValidation validation_;
    PacketCallback packet_callback_;
    EventCallback event_callback_;
    mutable std::mutex lifecycle_mutex_;
    mutable std::mutex parser_wait_mutex_;
    std::condition_variable parser_wait_;
    EmptyPacketParser parser_;
    std::thread parser_thread_;
    std::atomic<bool> running_{false};
    std::atomic<bool> stop_requested_{false};
    std::atomic<bool> parser_thread_running_{false};
    std::atomic<std::uint64_t> next_sequence_{1};
};

} // namespace pruftnet::sniffing::internal

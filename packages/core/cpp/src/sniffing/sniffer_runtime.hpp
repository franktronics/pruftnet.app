#pragma once

#include <atomic>
#include <chrono>
#include <memory>
#include <mutex>
#include <optional>
#include <thread>

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
        std::unique_ptr<PacketSource> packet_source,
        SnifferOptionsValidation validation,
        PacketCallback packet_callback,
        EventCallback event_callback);
    ~SnifferRuntime();

    SnifferRuntime(const SnifferRuntime&) = delete;
    SnifferRuntime& operator=(const SnifferRuntime&) = delete;

    [[nodiscard]] std::optional<SnifferError> start();
    void stop() noexcept;
    [[nodiscard]] bool is_running() const noexcept;
    [[nodiscard]] SnifferStatsSnapshot stats() const noexcept;

private:
    static void packet_source_callback(void* user_data, const pcap_pkthdr& header, const unsigned char* bytes) noexcept;

    [[nodiscard]] std::optional<SnifferError> validate_start_options() const;
    void request_stop() noexcept;
    void join_threads() noexcept;
    void capture_loop() noexcept;
    void parser_loop() noexcept;
    void handle_packet(const pcap_pkthdr& header, const unsigned char* bytes) noexcept;
    void update_kernel_stats_if_due() noexcept;
    void emit_event(const SnifferEvent& event) const noexcept;
    void emit_error(const SnifferError& error) const noexcept;

    SnifferOptions options_;
    std::unique_ptr<PacketSource> packet_source_;
    SnifferOptionsValidation validation_;
    PacketCallback packet_callback_;
    EventCallback event_callback_;
    mutable std::mutex lifecycle_mutex_;
    std::unique_ptr<PacketRing> ring_;
    EmptyPacketParser parser_;
    std::thread capture_thread_;
    std::thread parser_thread_;
    InternalStats stats_;
    std::atomic<bool> running_{false};
    std::atomic<bool> stop_requested_{false};
    std::atomic<bool> capture_done_{false};
    std::atomic<bool> capture_thread_running_{false};
    std::atomic<bool> parser_thread_running_{false};
    std::atomic<bool> ring_full_reported_{false};
    std::atomic<std::uint64_t> next_sequence_{1};
    int link_type_ = 0;
    std::chrono::steady_clock::time_point next_stats_at_{};
};

} // namespace pruftnet::sniffing::internal

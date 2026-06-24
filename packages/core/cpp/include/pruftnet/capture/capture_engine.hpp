#pragma once

#include <atomic>
#include <memory>
#include <mutex>
#include <optional>
#include <thread>

#include "pruftnet/capture/capture_config.hpp"
#include "pruftnet/capture/capture_error.hpp"
#include "pruftnet/capture/capture_event.hpp"
#include "pruftnet/capture/packet_ring.hpp"
#include "pruftnet/capture/packet_sink.hpp"
#include "pruftnet/capture/pcap_handle.hpp"
#include "pruftnet/capture/stats.hpp"

namespace pruftnet::capture {

class CaptureEngine {
public:
    CaptureEngine(CaptureConfig config, PacketSink& sink, CaptureEventCallback event_callback = {});
    ~CaptureEngine();

    CaptureEngine(const CaptureEngine&) = delete;
    CaptureEngine& operator=(const CaptureEngine&) = delete;

    std::optional<CaptureError> start();
    void request_stop() noexcept;
    void stop() noexcept;
    void wait() noexcept;

    [[nodiscard]] bool is_running() const noexcept;
    [[nodiscard]] CaptureStatsSnapshot stats() const noexcept;

private:
    static void pcap_packet_callback(unsigned char* user_data, const pcap_pkthdr* header, const unsigned char* bytes);

    std::optional<CaptureError> validate_config() const;
    void capture_loop() noexcept;
    void parser_loop() noexcept;
    void handle_packet(const pcap_pkthdr& header, const unsigned char* bytes) noexcept;
    void emit_event(const CaptureEvent& event) const noexcept;
    void emit_error(const CaptureError& error) const noexcept;
    void update_kernel_stats_if_due() noexcept;

    CaptureConfig config_;
    PacketSink& sink_;
    CaptureEventCallback event_callback_;
    mutable std::mutex lifecycle_mutex_;
    std::unique_ptr<PcapHandle> handle_;
    std::unique_ptr<PacketRing> ring_;
    std::thread capture_thread_;
    std::thread parser_thread_;
    CaptureStats stats_;
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

} // namespace pruftnet::capture

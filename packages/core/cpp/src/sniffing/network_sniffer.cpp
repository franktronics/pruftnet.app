#include "pruftnet/sniffing/network_sniffer.hpp"

#include <chrono>
#include <exception>
#include <new>
#include <sstream>
#include <thread>
#include <utility>
#include <variant>

#include "sniffing/empty_packet_parser.hpp"
#include "sniffing/internal_stats.hpp"
#include "sniffing/link_type.hpp"
#include "sniffing/packet_ring.hpp"
#include "sniffing/pcap_session.hpp"

namespace pruftnet::sniffing {
namespace {

std::uint64_t packet_timestamp_ns(const pcap_pkthdr &header,
                                  internal::TimestampPrecision precision) {
  const auto seconds = static_cast<std::uint64_t>(header.ts.tv_sec);
  const auto subsecond = static_cast<std::uint64_t>(header.ts.tv_usec);
  return seconds * 1'000'000'000ULL +
         (precision == internal::TimestampPrecision::Nanoseconds
              ? subsecond
              : subsecond * 1'000ULL);
}

} // namespace

class NetworkSniffer::Impl {
public:
  Impl(SnifferOptions options, PacketCallback packet_callback,
       EventCallback event_callback)
      : options_(std::move(options)),
        packet_callback_(std::move(packet_callback)),
        event_callback_(std::move(event_callback)) {}

  ~Impl() { stop(); }

  std::optional<SnifferError> start() {
    std::unique_lock lock(lifecycle_mutex_);

    if (running_.load(std::memory_order_acquire)) {
      return make_sniffer_error(
          SnifferErrorCode::InvalidOptions, SnifferSeverity::Error,
          "NetworkSniffer is already running.", options_.interface_name);
    }

    if (auto error = validate_options()) {
      return error;
    }

    auto open_result = internal::open_pcap_session(options_);
    if (std::holds_alternative<SnifferError>(open_result)) {
      return std::get<SnifferError>(std::move(open_result));
    }

    auto success = std::get<internal::PcapOpenSuccess>(std::move(open_result));
    for (const auto &warning : success.warnings) {
      emit_event(warning);
    }

    session_ =
        std::make_unique<internal::PcapSession>(std::move(success.session));
    link_type_ = session_->link_type();

    if (!internal::is_link_type_accepted(link_type_,
                                         options_.accepted_link_types)) {
      std::ostringstream message;
      message << "Unsupported link type "
              << internal::link_type_name(link_type_)
              << ". Accepted link types: "
              << internal::format_link_type_list(options_.accepted_link_types)
              << '.';

      session_.reset();
      return make_sniffer_error(SnifferErrorCode::UnsupportedLinkType,
                                SnifferSeverity::Error, message.str(),
                                options_.interface_name);
    }

    try {
      ring_ = std::make_unique<internal::PacketRing>(
          options_.ring_slots, static_cast<std::size_t>(options_.snaplen));
    } catch (const std::bad_alloc &) {
      session_.reset();
      return make_sniffer_error(
          SnifferErrorCode::AllocationFailed, SnifferSeverity::Fatal,
          "Failed to allocate packet ring.", options_.interface_name);
    } catch (const std::exception &error) {
      session_.reset();
      return make_sniffer_error(SnifferErrorCode::InvalidOptions,
                                SnifferSeverity::Error, error.what(),
                                options_.interface_name);
    }

    stop_requested_.store(false, std::memory_order_release);
    capture_done_.store(false, std::memory_order_release);
    capture_thread_running_.store(false, std::memory_order_release);
    parser_thread_running_.store(false, std::memory_order_release);
    ring_full_reported_.store(false, std::memory_order_release);
    next_sequence_.store(1, std::memory_order_release);
    next_stats_at_ =
        std::chrono::steady_clock::now() + options_.stats_poll_interval;
    running_.store(true, std::memory_order_release);

    try {
      parser_thread_ = std::thread(&Impl::parser_loop, this);
      capture_thread_ = std::thread(&Impl::capture_loop, this);
    } catch (const std::exception &error) {
      request_stop();
      lock.unlock();
      join_threads();
      return make_sniffer_error(
          SnifferErrorCode::ThreadStartFailed, SnifferSeverity::Fatal,
          std::string("Failed to start sniffer threads: ") + error.what(),
          options_.interface_name);
    }

    return std::nullopt;
  }

  void stop() noexcept {
    request_stop();
    join_threads();
  }

  bool is_running() const noexcept {
    return running_.load(std::memory_order_acquire);
  }

  SnifferStatsSnapshot stats() const noexcept {
    const auto ring_depth = ring_ ? ring_->depth() : 0;
    const auto ring_capacity = ring_ ? ring_->capacity() : 0;
    return stats_.snapshot(
        ring_depth, ring_capacity,
        capture_thread_running_.load(std::memory_order_relaxed),
        parser_thread_running_.load(std::memory_order_relaxed));
  }

private:
  static void pcap_packet_callback(unsigned char *user_data,
                                   const pcap_pkthdr *header,
                                   const unsigned char *bytes) {
    if (user_data == nullptr || header == nullptr) {
      return;
    }

    auto *self = reinterpret_cast<Impl *>(user_data);
    self->handle_packet(*header, bytes);
  }

  std::optional<SnifferError> validate_options() const {
    if (options_.interface_name.empty()) {
      return make_sniffer_error(SnifferErrorCode::InvalidOptions,
                                SnifferSeverity::Error,
                                "SnifferOptions.interface_name is required.");
    }

    if (!packet_callback_) {
      return make_sniffer_error(SnifferErrorCode::InvalidOptions,
                                SnifferSeverity::Error,
                                "NetworkSniffer requires a packet callback.",
                                options_.interface_name);
    }

    if (options_.snaplen <= 0) {
      return make_sniffer_error(
          SnifferErrorCode::InvalidOptions, SnifferSeverity::Error,
          "SnifferOptions.snaplen must be greater than zero.",
          options_.interface_name);
    }

    if (options_.pcap_buffer_size_bytes <= 0) {
      return make_sniffer_error(
          SnifferErrorCode::InvalidOptions, SnifferSeverity::Error,
          "SnifferOptions.pcap_buffer_size_bytes must be greater than zero.",
          options_.interface_name);
    }

    if (options_.read_timeout_ms < 0) {
      return make_sniffer_error(
          SnifferErrorCode::InvalidOptions, SnifferSeverity::Error,
          "SnifferOptions.read_timeout_ms must be zero or greater.",
          options_.interface_name);
    }

    if (options_.pcap_dispatch_batch_size <= 0) {
      return make_sniffer_error(
          SnifferErrorCode::InvalidOptions, SnifferSeverity::Error,
          "SnifferOptions.pcap_dispatch_batch_size must be greater than zero.",
          options_.interface_name);
    }

    if (options_.ring_slots == 0) {
      return make_sniffer_error(
          SnifferErrorCode::InvalidOptions, SnifferSeverity::Error,
          "SnifferOptions.ring_slots must be greater than zero.",
          options_.interface_name);
    }

    if (options_.accepted_link_types.empty()) {
      return make_sniffer_error(
          SnifferErrorCode::InvalidOptions, SnifferSeverity::Error,
          "SnifferOptions.accepted_link_types must not be empty.",
          options_.interface_name);
    }

    return std::nullopt;
  }

  void request_stop() noexcept {
    stop_requested_.store(true, std::memory_order_release);

    if (session_) {
      session_->break_loop();
    }

    if (ring_) {
      ring_->notify_all();
    }
  }

  void join_threads() noexcept {
    std::lock_guard lock(lifecycle_mutex_);

    if (capture_thread_.joinable() &&
        capture_thread_.get_id() != std::this_thread::get_id()) {
      capture_thread_.join();
    }

    if (parser_thread_.joinable() &&
        parser_thread_.get_id() != std::this_thread::get_id()) {
      parser_thread_.join();
    }

    running_.store(false, std::memory_order_release);
  }

  void capture_loop() noexcept {
    capture_thread_running_.store(true, std::memory_order_release);

    try {
      while (!stop_requested_.load(std::memory_order_acquire)) {
        stats_.increment_pcap_dispatch_calls();
        const auto result = session_->dispatch(
            options_.pcap_dispatch_batch_size, &Impl::pcap_packet_callback,
            reinterpret_cast<unsigned char *>(this));

        if (result == PCAP_ERROR_BREAK) {
          break;
        }

        if (result < 0) {
          stats_.increment_pcap_dispatch_errors();
          emit_error(make_sniffer_error(
              SnifferErrorCode::DispatchFailed, SnifferSeverity::Error,
              "pcap_dispatch failed.", options_.interface_name, result,
              session_->last_error()));
          break;
        }

        update_kernel_stats_if_due();
      }
    } catch (const std::exception &error) {
      emit_error(make_sniffer_error(
          SnifferErrorCode::InternalInvariantViolation, SnifferSeverity::Fatal,
          std::string("Unhandled exception in capture thread: ") + error.what(),
          options_.interface_name));
    } catch (...) {
      emit_error(make_sniffer_error(
          SnifferErrorCode::InternalInvariantViolation, SnifferSeverity::Fatal,
          "Unknown exception in capture thread.", options_.interface_name));
    }

    update_kernel_stats_if_due();
    capture_done_.store(true, std::memory_order_release);
    capture_thread_running_.store(false, std::memory_order_release);

    if (ring_) {
      ring_->notify_all();
    }
  }

  void parser_loop() noexcept {
    parser_thread_running_.store(true, std::memory_order_release);

    try {
      while (!stop_requested_.load(std::memory_order_acquire) ||
             !capture_done_.load(std::memory_order_acquire) ||
             (ring_ && !ring_->empty())) {
        if (!ring_) {
          break;
        }

        if (auto queued = ring_->peek()) {
          RawPacketView raw_packet;
          raw_packet.metadata = queued->metadata;
          raw_packet.bytes = queued->bytes;

          const auto parsed_packet = parser_.parse(raw_packet);
          stats_.increment_packets_parsed();

          packet_callback_(raw_packet, parsed_packet, stats());
          ring_->pop();
          continue;
        }

        ring_->wait_for_data(std::chrono::milliseconds(10));
      }
    } catch (const std::exception &error) {
      emit_error(make_sniffer_error(
          SnifferErrorCode::InternalInvariantViolation, SnifferSeverity::Fatal,
          std::string("Unhandled exception in parser thread: ") + error.what(),
          options_.interface_name));
      request_stop();
    } catch (...) {
      emit_error(make_sniffer_error(
          SnifferErrorCode::InternalInvariantViolation, SnifferSeverity::Fatal,
          "Unknown exception in parser thread.", options_.interface_name));
      request_stop();
    }

    parser_thread_running_.store(false, std::memory_order_release);
    running_.store(false, std::memory_order_release);
  }

  void handle_packet(const pcap_pkthdr &header,
                     const unsigned char *bytes) noexcept {
    stats_.increment_packets_seen();

    if (bytes == nullptr && header.caplen > 0) {
      emit_error(make_sniffer_error(
          SnifferErrorCode::DispatchFailed, SnifferSeverity::Warning,
          "pcap callback produced a null packet payload.",
          options_.interface_name, 0, {}, true));
      return;
    }

    PacketMetadata metadata;
    metadata.sequence = next_sequence_.fetch_add(1, std::memory_order_relaxed);
    metadata.timestamp_ns =
        packet_timestamp_ns(header, session_->timestamp_precision());
    metadata.interface_id = options_.interface_id;
    metadata.captured_len = header.caplen;
    metadata.wire_len = header.len;
    metadata.link_type = static_cast<std::uint32_t>(link_type_);
    metadata.flags = PacketFlagNone;

    if (header.caplen < header.len) {
      metadata.flags |= PacketFlagTruncated;
    }

    const auto payload =
        std::span<const std::byte>(reinterpret_cast<const std::byte *>(bytes),
                                   static_cast<std::size_t>(header.caplen));

    if (!ring_->try_push(metadata, payload)) {
      stats_.increment_app_ring_drops();
      if (!ring_full_reported_.exchange(true, std::memory_order_acq_rel)) {
        emit_error(make_sniffer_error(SnifferErrorCode::RingFull,
                                      SnifferSeverity::Warning,
                                      "Application packet ring is full; newest "
                                      "packets are being dropped.",
                                      options_.interface_name, 0, {}, true));
      }
      return;
    }

    stats_.increment_packets_enqueued();
    stats_.observe_ring_depth(ring_->depth());
  }

  void update_kernel_stats_if_due() noexcept {
    if (options_.stats_poll_interval.count() <= 0 || !session_) {
      return;
    }

    const auto now = std::chrono::steady_clock::now();
    if (now < next_stats_at_) {
      return;
    }

    next_stats_at_ = now + options_.stats_poll_interval;
    auto result = session_->read_stats(options_.interface_name);
    if (std::holds_alternative<internal::PcapKernelStats>(result)) {
      const auto kernel_stats = std::get<internal::PcapKernelStats>(result);
      stats_.set_kernel_stats(kernel_stats.recv, kernel_stats.drop,
                              kernel_stats.ifdrop);
    } else {
      emit_error(std::get<SnifferError>(std::move(result)));
    }
  }

  void emit_event(const SnifferEvent &event) const noexcept {
    if (!event_callback_) {
      return;
    }

    try {
      event_callback_(event);
    } catch (...) {
    }
  }

  void emit_error(const SnifferError &error) const noexcept {
    emit_event(SnifferEvent::from_error(error));
  }

  SnifferOptions options_;
  PacketCallback packet_callback_;
  EventCallback event_callback_;
  mutable std::mutex lifecycle_mutex_;
  std::unique_ptr<internal::PcapSession> session_;
  std::unique_ptr<internal::PacketRing> ring_;
  internal::EmptyPacketParser parser_;
  std::thread capture_thread_;
  std::thread parser_thread_;
  internal::InternalStats stats_;
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

NetworkSniffer::NetworkSniffer(SnifferOptions options,
                               PacketCallback packet_callback,
                               EventCallback event_callback)
    : impl_(std::make_unique<Impl>(std::move(options),
                                   std::move(packet_callback),
                                   std::move(event_callback))) {}

NetworkSniffer::~NetworkSniffer() = default;

NetworkSniffer::NetworkSniffer(NetworkSniffer &&) noexcept = default;

NetworkSniffer &NetworkSniffer::operator=(NetworkSniffer &&) noexcept = default;

std::optional<SnifferError> NetworkSniffer::start() { return impl_->start(); }

void NetworkSniffer::stop() noexcept { impl_->stop(); }

bool NetworkSniffer::is_running() const noexcept { return impl_->is_running(); }

SnifferStatsSnapshot NetworkSniffer::stats() const noexcept {
  return impl_->stats();
}

} // namespace pruftnet::sniffing

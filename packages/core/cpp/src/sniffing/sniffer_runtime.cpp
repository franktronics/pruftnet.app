#include "sniffing/sniffer_runtime.hpp"

#include <exception>
#include <new>
#include <sstream>
#include <utility>
#include <variant>

#include "sniffing/link_type.hpp"

namespace pruftnet::sniffing::internal {
namespace {

std::uint64_t packet_timestamp_ns(const pcap_pkthdr& header, TimestampPrecision precision) {
    const auto seconds = static_cast<std::uint64_t>(header.ts.tv_sec);
    const auto subsecond = static_cast<std::uint64_t>(header.ts.tv_usec);
    return seconds * 1'000'000'000ULL +
           (precision == TimestampPrecision::Nanoseconds ? subsecond : subsecond * 1'000ULL);
}

} // namespace

SnifferRuntime::SnifferRuntime(
    SnifferOptions options,
    std::unique_ptr<PacketSource> packet_source,
    SnifferOptionsValidation validation,
    PacketCallback packet_callback,
    EventCallback event_callback)
    : options_(std::move(options)),
      packet_source_(std::move(packet_source)),
      validation_(validation),
      packet_callback_(std::move(packet_callback)),
      event_callback_(std::move(event_callback)) {}

SnifferRuntime::~SnifferRuntime() { stop(); }

std::optional<SnifferError> SnifferRuntime::start() {
    std::unique_lock lock(lifecycle_mutex_);

    if (running_.load(std::memory_order_acquire)) {
        return make_sniffer_error(
            SnifferErrorCode::InvalidOptions,
            SnifferSeverity::Error,
            "SnifferRuntime is already running.",
            options_.interface_name);
    }

    if (auto error = validate_start_options()) {
        return error;
    }

    auto open_result = packet_source_->open();
    if (std::holds_alternative<SnifferError>(open_result)) {
        return std::get<SnifferError>(std::move(open_result));
    }

    auto success = std::get<PacketSourceOpenSuccess>(std::move(open_result));
    for (const auto& warning : success.warnings) {
        emit_event(warning);
    }

    link_type_ = packet_source_->link_type();
    if (!is_link_type_accepted(link_type_, options_.accepted_link_types)) {
        std::ostringstream message;
        message << "Unsupported link type " << link_type_name(link_type_)
                << ". Accepted link types: " << format_link_type_list(options_.accepted_link_types) << '.';

        packet_source_->close();
        return make_sniffer_error(
            SnifferErrorCode::UnsupportedLinkType,
            SnifferSeverity::Error,
            message.str(),
            packet_source_->source_name());
    }

    const auto snapshot_length = packet_source_->snapshot_length();
    if (snapshot_length <= 0) {
        packet_source_->close();
        return make_sniffer_error(
            SnifferErrorCode::InvalidOptions,
            SnifferSeverity::Error,
            "Packet source snapshot length must be greater than zero.",
            packet_source_->source_name());
    }

    try {
        ring_ = std::make_unique<PacketRing>(
            options_.ring_slots,
            static_cast<std::size_t>(snapshot_length));
    } catch (const std::bad_alloc&) {
        packet_source_->close();
        return make_sniffer_error(
            SnifferErrorCode::AllocationFailed,
            SnifferSeverity::Fatal,
            "Failed to allocate packet ring.",
            packet_source_->source_name());
    } catch (const std::exception& error) {
        packet_source_->close();
        return make_sniffer_error(
            SnifferErrorCode::InvalidOptions,
            SnifferSeverity::Error,
            error.what(),
            packet_source_->source_name());
    }

    stats_.reset();
    stop_requested_.store(false, std::memory_order_release);
    capture_done_.store(false, std::memory_order_release);
    capture_thread_running_.store(false, std::memory_order_release);
    parser_thread_running_.store(false, std::memory_order_release);
    ring_full_reported_.store(false, std::memory_order_release);
    next_sequence_.store(1, std::memory_order_release);
    next_stats_at_ = std::chrono::steady_clock::now() + options_.stats_poll_interval;
    running_.store(true, std::memory_order_release);

    try {
        parser_thread_ = std::thread(&SnifferRuntime::parser_loop, this);
        capture_thread_ = std::thread(&SnifferRuntime::capture_loop, this);
    } catch (const std::exception& error) {
        request_stop();
        lock.unlock();
        join_threads();
        packet_source_->close();
        return make_sniffer_error(
            SnifferErrorCode::ThreadStartFailed,
            SnifferSeverity::Fatal,
            std::string("Failed to start sniffer threads: ") + error.what(),
            packet_source_->source_name());
    }

    return std::nullopt;
}

void SnifferRuntime::stop() noexcept {
    request_stop();
    join_threads();
    if (packet_source_) {
        packet_source_->close();
    }
}

bool SnifferRuntime::is_running() const noexcept {
    return running_.load(std::memory_order_acquire);
}

SnifferStatsSnapshot SnifferRuntime::stats() const noexcept {
    const auto ring_depth = ring_ ? ring_->depth() : 0;
    const auto ring_capacity = ring_ ? ring_->capacity() : 0;
    return stats_.snapshot(
        ring_depth,
        ring_capacity,
        capture_thread_running_.load(std::memory_order_relaxed),
        parser_thread_running_.load(std::memory_order_relaxed));
}

void SnifferRuntime::packet_source_callback(
    void* user_data,
    const pcap_pkthdr& header,
    const unsigned char* bytes) noexcept {
    if (user_data == nullptr) {
        return;
    }

    auto* self = static_cast<SnifferRuntime*>(user_data);
    self->handle_packet(header, bytes);
}

std::optional<SnifferError> SnifferRuntime::validate_start_options() const {
    if (packet_source_ == nullptr) {
        return make_sniffer_error(
            SnifferErrorCode::InvalidOptions,
            SnifferSeverity::Error,
            "SnifferRuntime requires a packet source.",
            options_.interface_name);
    }

    if (!packet_callback_) {
        return make_sniffer_error(
            SnifferErrorCode::InvalidOptions,
            SnifferSeverity::Error,
            "SnifferRuntime requires a packet callback.",
            options_.interface_name);
    }

    return validate_sniffer_options(options_, validation_);
}

void SnifferRuntime::request_stop() noexcept {
    stop_requested_.store(true, std::memory_order_release);

    if (packet_source_) {
        packet_source_->interrupt();
    }

    if (ring_) {
        ring_->notify_all();
    }
}

void SnifferRuntime::join_threads() noexcept {
    std::lock_guard lock(lifecycle_mutex_);

    const auto current_thread = std::this_thread::get_id();
    if ((capture_thread_.joinable() && capture_thread_.get_id() == current_thread) ||
        (parser_thread_.joinable() && parser_thread_.get_id() == current_thread)) {
        return;
    }

    if (capture_thread_.joinable()) {
        capture_thread_.join();
    }

    if (parser_thread_.joinable()) {
        parser_thread_.join();
    }

    if (!capture_thread_.joinable() && !parser_thread_.joinable()) {
        running_.store(false, std::memory_order_release);
    }
}

void SnifferRuntime::capture_loop() noexcept {
    capture_thread_running_.store(true, std::memory_order_release);

    try {
        while (!stop_requested_.load(std::memory_order_acquire)) {
            stats_.increment_pcap_dispatch_calls();
            const auto result = packet_source_->dispatch(
                options_.pcap_dispatch_batch_size,
                &SnifferRuntime::packet_source_callback,
                this);

            switch (result.status) {
            case PacketSourceDispatchStatus::PacketsRead:
            case PacketSourceDispatchStatus::NoPacketsAvailable:
                update_kernel_stats_if_due();
                continue;
            case PacketSourceDispatchStatus::EndOfInput:
            case PacketSourceDispatchStatus::Interrupted:
                break;
            case PacketSourceDispatchStatus::Error:
                stats_.increment_pcap_dispatch_errors();
                emit_error(make_sniffer_error(
                    SnifferErrorCode::DispatchFailed,
                    SnifferSeverity::Error,
                    "pcap_dispatch failed.",
                    packet_source_->source_name(),
                    result.pcap_status,
                    result.error_message));
                break;
            }

            break;
        }
    } catch (const std::exception& error) {
        emit_error(make_sniffer_error(
            SnifferErrorCode::InternalInvariantViolation,
            SnifferSeverity::Fatal,
            std::string("Unhandled exception in capture thread: ") + error.what(),
            packet_source_ ? packet_source_->source_name() : options_.interface_name));
    } catch (...) {
        emit_error(make_sniffer_error(
            SnifferErrorCode::InternalInvariantViolation,
            SnifferSeverity::Fatal,
            "Unknown exception in capture thread.",
            packet_source_ ? packet_source_->source_name() : options_.interface_name));
    }

    update_kernel_stats_if_due();
    capture_done_.store(true, std::memory_order_release);
    capture_thread_running_.store(false, std::memory_order_release);

    if (ring_) {
        ring_->notify_all();
    }
}

void SnifferRuntime::parser_loop() noexcept {
    parser_thread_running_.store(true, std::memory_order_release);

    try {
        while (!capture_done_.load(std::memory_order_acquire) || (ring_ && !ring_->empty())) {
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
    } catch (const std::exception& error) {
        emit_error(make_sniffer_error(
            SnifferErrorCode::InternalInvariantViolation,
            SnifferSeverity::Fatal,
            std::string("Unhandled exception in parser thread: ") + error.what(),
            packet_source_ ? packet_source_->source_name() : options_.interface_name));
        request_stop();
    } catch (...) {
        emit_error(make_sniffer_error(
            SnifferErrorCode::InternalInvariantViolation,
            SnifferSeverity::Fatal,
            "Unknown exception in parser thread.",
            packet_source_ ? packet_source_->source_name() : options_.interface_name));
        request_stop();
    }

    parser_thread_running_.store(false, std::memory_order_release);
    running_.store(false, std::memory_order_release);
}

void SnifferRuntime::handle_packet(const pcap_pkthdr& header, const unsigned char* bytes) noexcept {
    stats_.increment_packets_seen();

    if (bytes == nullptr && header.caplen > 0) {
        emit_error(make_sniffer_error(
            SnifferErrorCode::DispatchFailed,
            SnifferSeverity::Warning,
            "pcap callback produced a null packet payload.",
            packet_source_->source_name(),
            0,
            {},
            true));
        return;
    }

    PacketMetadata metadata;
    metadata.sequence = next_sequence_.fetch_add(1, std::memory_order_relaxed);
    metadata.timestamp_ns = packet_timestamp_ns(header, packet_source_->timestamp_precision());
    metadata.interface_id = options_.interface_id;
    metadata.captured_len = header.caplen;
    metadata.wire_len = header.len;
    metadata.link_type = static_cast<std::uint32_t>(link_type_);
    metadata.flags = PacketFlagNone;

    if (header.caplen < header.len) {
        metadata.flags |= PacketFlagTruncated;
    }

    const auto payload = std::span<const std::byte>(
        reinterpret_cast<const std::byte*>(bytes),
        static_cast<std::size_t>(header.caplen));

    if (!ring_->try_push(metadata, payload)) {
        stats_.increment_app_ring_drops();
        if (!ring_full_reported_.exchange(true, std::memory_order_acq_rel)) {
            emit_error(make_sniffer_error(
                SnifferErrorCode::RingFull,
                SnifferSeverity::Warning,
                "Application packet ring is full or packet exceeds the ring slot size; newest packets are being dropped.",
                packet_source_->source_name(),
                0,
                {},
                true));
        }
        return;
    }

    stats_.increment_packets_enqueued();
    stats_.observe_ring_depth(ring_->depth());
}

void SnifferRuntime::update_kernel_stats_if_due() noexcept {
    if (options_.stats_poll_interval.count() <= 0 || !packet_source_) {
        return;
    }

    const auto now = std::chrono::steady_clock::now();
    if (now < next_stats_at_) {
        return;
    }

    next_stats_at_ = now + options_.stats_poll_interval;
    auto result = packet_source_->read_stats();
    if (std::holds_alternative<PcapKernelStats>(result)) {
        const auto kernel_stats = std::get<PcapKernelStats>(result);
        stats_.set_kernel_stats(kernel_stats.recv, kernel_stats.drop, kernel_stats.ifdrop);
    } else {
        emit_error(std::get<SnifferError>(std::move(result)));
    }
}

void SnifferRuntime::emit_event(const SnifferEvent& event) const noexcept {
    if (!event_callback_) {
        return;
    }

    try {
        event_callback_(event);
    } catch (...) {
    }
}

void SnifferRuntime::emit_error(const SnifferError& error) const noexcept {
    emit_event(SnifferEvent::from_error(error));
}

} // namespace pruftnet::sniffing::internal

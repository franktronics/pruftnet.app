#include "pruftnet/capture/capture_engine.hpp"

#include <algorithm>
#include <chrono>
#include <exception>
#include <new>
#include <sstream>
#include <utility>
#include <variant>

#include "pruftnet/capture/pcap_linktype.hpp"

namespace pruftnet::capture {
namespace {

std::uint64_t packet_timestamp_ns(const pcap_pkthdr& header, TimestampPrecision precision) {
    const auto seconds = static_cast<std::uint64_t>(header.ts.tv_sec);
    const auto subsecond = static_cast<std::uint64_t>(header.ts.tv_usec);
    return seconds * 1'000'000'000ULL +
           (precision == TimestampPrecision::Nanoseconds ? subsecond : subsecond * 1'000ULL);
}

} // namespace

CaptureEngine::CaptureEngine(
    CaptureConfig config,
    PacketSink& sink,
    CaptureEventCallback event_callback)
    : config_(std::move(config)), sink_(sink), event_callback_(std::move(event_callback)) {}

CaptureEngine::~CaptureEngine() {
    stop();
}

std::optional<CaptureError> CaptureEngine::start() {
    std::unique_lock lock(lifecycle_mutex_);

    if (running_.load(std::memory_order_acquire)) {
        return make_capture_error(
            CaptureErrorCode::InvalidConfig,
            CaptureSeverity::Error,
            "CaptureEngine is already running.",
            config_.interface_name);
    }

    if (auto error = validate_config()) {
        return error;
    }

    auto open_result = open_pcap_handle(config_);
    if (std::holds_alternative<CaptureError>(open_result)) {
        return std::get<CaptureError>(std::move(open_result));
    }

    auto success = std::get<PcapOpenSuccess>(std::move(open_result));
    for (const auto& warning : success.warnings) {
        emit_event(warning);
    }

    handle_ = std::make_unique<PcapHandle>(std::move(success.handle));
    link_type_ = handle_->link_type();

    if (!is_link_type_accepted(link_type_, config_.accepted_link_types)) {
        std::ostringstream message;
        message << "Unsupported link type " << link_type_name(link_type_) << " ("
                << link_type_description(link_type_) << "). Accepted link types: "
                << format_link_type_list(config_.accepted_link_types) << '.';

        if (config_.unsupported_link_type_policy == UnsupportedLinkTypePolicy::Fail) {
            handle_.reset();
            return make_capture_error(
                CaptureErrorCode::UnsupportedLinkType,
                CaptureSeverity::Error,
                message.str(),
                config_.interface_name);
        }

        emit_error(make_capture_error(
            CaptureErrorCode::UnsupportedLinkType,
            CaptureSeverity::Warning,
            message.str(),
            config_.interface_name,
            0,
            {},
            true));
    }

    try {
        ring_ = std::make_unique<PacketRing>(config_.ring_slots, static_cast<std::size_t>(config_.snaplen));
    } catch (const std::bad_alloc&) {
        handle_.reset();
        return make_capture_error(
            CaptureErrorCode::AllocationFailed,
            CaptureSeverity::Fatal,
            "Failed to allocate capture packet ring.",
            config_.interface_name);
    } catch (const std::exception& error) {
        handle_.reset();
        return make_capture_error(
            CaptureErrorCode::InvalidConfig,
            CaptureSeverity::Error,
            error.what(),
            config_.interface_name);
    }

    stop_requested_.store(false, std::memory_order_release);
    capture_done_.store(false, std::memory_order_release);
    capture_thread_running_.store(false, std::memory_order_release);
    parser_thread_running_.store(false, std::memory_order_release);
    ring_full_reported_.store(false, std::memory_order_release);
    next_sequence_.store(1, std::memory_order_release);
    next_stats_at_ = std::chrono::steady_clock::now() + config_.stats_interval;
    running_.store(true, std::memory_order_release);

    try {
        parser_thread_ = std::thread(&CaptureEngine::parser_loop, this);
        capture_thread_ = std::thread(&CaptureEngine::capture_loop, this);
    } catch (const std::exception& error) {
        request_stop();
        lock.unlock();
        wait();
        return make_capture_error(
            CaptureErrorCode::ThreadStartFailed,
            CaptureSeverity::Fatal,
            std::string("Failed to start capture threads: ") + error.what(),
            config_.interface_name);
    }

    return std::nullopt;
}

void CaptureEngine::request_stop() noexcept {
    stop_requested_.store(true, std::memory_order_release);

    if (handle_) {
        handle_->break_loop();
    }

    if (ring_) {
        ring_->notify_all();
    }
}

void CaptureEngine::stop() noexcept {
    request_stop();
    wait();
}

void CaptureEngine::wait() noexcept {
    std::lock_guard lock(lifecycle_mutex_);

    if (capture_thread_.joinable()) {
        capture_thread_.join();
    }

    if (parser_thread_.joinable()) {
        parser_thread_.join();
    }

    running_.store(false, std::memory_order_release);
}

bool CaptureEngine::is_running() const noexcept {
    return running_.load(std::memory_order_acquire);
}

CaptureStatsSnapshot CaptureEngine::stats() const noexcept {
    const auto ring_depth = ring_ ? ring_->depth() : 0;
    const auto ring_capacity = ring_ ? ring_->capacity() : 0;
    return stats_.snapshot(
        ring_depth,
        ring_capacity,
        capture_thread_running_.load(std::memory_order_relaxed),
        parser_thread_running_.load(std::memory_order_relaxed));
}

void CaptureEngine::pcap_packet_callback(
    unsigned char* user_data,
    const pcap_pkthdr* header,
    const unsigned char* bytes) {
    if (user_data == nullptr || header == nullptr) {
        return;
    }

    auto* engine = reinterpret_cast<CaptureEngine*>(user_data);
    engine->handle_packet(*header, bytes);
}

std::optional<CaptureError> CaptureEngine::validate_config() const {
    if (config_.interface_name.empty()) {
        return make_capture_error(
            CaptureErrorCode::InvalidConfig,
            CaptureSeverity::Error,
            "Capture interface is required.");
    }

    if (config_.snaplen <= 0) {
        return make_capture_error(
            CaptureErrorCode::InvalidConfig,
            CaptureSeverity::Error,
            "snaplen must be greater than zero.",
            config_.interface_name);
    }

    if (config_.pcap_buffer_size_bytes <= 0) {
        return make_capture_error(
            CaptureErrorCode::InvalidConfig,
            CaptureSeverity::Error,
            "pcap buffer size must be greater than zero.",
            config_.interface_name);
    }

    if (config_.read_timeout_ms < 0) {
        return make_capture_error(
            CaptureErrorCode::InvalidConfig,
            CaptureSeverity::Error,
            "pcap read timeout must be zero or greater.",
            config_.interface_name);
    }

    if (config_.dispatch_batch_size <= 0) {
        return make_capture_error(
            CaptureErrorCode::InvalidConfig,
            CaptureSeverity::Error,
            "dispatch batch size must be greater than zero.",
            config_.interface_name);
    }

    if (config_.ring_slots == 0) {
        return make_capture_error(
            CaptureErrorCode::InvalidConfig,
            CaptureSeverity::Error,
            "ring_slots must be greater than zero.",
            config_.interface_name);
    }

    if (config_.accepted_link_types.empty()) {
        return make_capture_error(
            CaptureErrorCode::InvalidConfig,
            CaptureSeverity::Error,
            "At least one accepted link type is required.",
            config_.interface_name);
    }

    return std::nullopt;
}

void CaptureEngine::capture_loop() noexcept {
    capture_thread_running_.store(true, std::memory_order_release);

    try {
        while (!stop_requested_.load(std::memory_order_acquire)) {
            stats_.increment_pcap_dispatch_calls();
            const auto result = handle_->dispatch(
                config_.dispatch_batch_size,
                &CaptureEngine::pcap_packet_callback,
                reinterpret_cast<unsigned char*>(this));

            if (result == PCAP_ERROR_BREAK) {
                break;
            }

            if (result < 0) {
                stats_.increment_pcap_dispatch_errors();
                emit_error(make_capture_error(
                    CaptureErrorCode::DispatchFailed,
                    CaptureSeverity::Error,
                    "pcap_dispatch failed.",
                    config_.interface_name,
                    result,
                    handle_->last_error()));
                break;
            }

            update_kernel_stats_if_due();
        }
    } catch (const std::exception& error) {
        emit_error(make_capture_error(
            CaptureErrorCode::InternalInvariantViolation,
            CaptureSeverity::Fatal,
            std::string("Unhandled exception in capture thread: ") + error.what(),
            config_.interface_name));
    } catch (...) {
        emit_error(make_capture_error(
            CaptureErrorCode::InternalInvariantViolation,
            CaptureSeverity::Fatal,
            "Unknown exception in capture thread.",
            config_.interface_name));
    }

    update_kernel_stats_if_due();
    capture_done_.store(true, std::memory_order_release);
    capture_thread_running_.store(false, std::memory_order_release);

    if (ring_) {
        ring_->notify_all();
    }
}

void CaptureEngine::parser_loop() noexcept {
    parser_thread_running_.store(true, std::memory_order_release);

    try {
        while (!stop_requested_.load(std::memory_order_acquire) ||
               !capture_done_.load(std::memory_order_acquire) ||
               (ring_ && !ring_->empty())) {
            if (!ring_) {
                break;
            }

            if (auto view = ring_->peek()) {
                sink_.on_packet(view->record, view->bytes);
                stats_.increment_packets_parsed();
                ring_->pop();
                continue;
            }

            ring_->wait_for_data(std::chrono::milliseconds(10));
        }
    } catch (const std::exception& error) {
        emit_error(make_capture_error(
            CaptureErrorCode::InternalInvariantViolation,
            CaptureSeverity::Fatal,
            std::string("Unhandled exception in parser thread: ") + error.what(),
            config_.interface_name));
        request_stop();
    } catch (...) {
        emit_error(make_capture_error(
            CaptureErrorCode::InternalInvariantViolation,
            CaptureSeverity::Fatal,
            "Unknown exception in parser thread.",
            config_.interface_name));
        request_stop();
    }

    parser_thread_running_.store(false, std::memory_order_release);
    running_.store(false, std::memory_order_release);
}

void CaptureEngine::handle_packet(const pcap_pkthdr& header, const unsigned char* bytes) noexcept {
    stats_.increment_packets_seen();

    if (bytes == nullptr && header.caplen > 0) {
        emit_error(make_capture_error(
            CaptureErrorCode::DispatchFailed,
            CaptureSeverity::Warning,
            "pcap callback produced a null packet payload.",
            config_.interface_name,
            0,
            {},
            true));
        return;
    }

    PacketRecord record;
    record.sequence = next_sequence_.fetch_add(1, std::memory_order_relaxed);
    record.timestamp_ns = packet_timestamp_ns(header, handle_->timestamp_precision());
    record.interface_id = config_.interface_id;
    record.captured_len = header.caplen;
    record.wire_len = header.len;
    record.link_type = static_cast<std::uint32_t>(link_type_);
    record.flags = PacketFlagNone;

    if (header.caplen < header.len) {
        record.flags |= PacketFlagTruncated;
    }

    if (!is_link_type_accepted(link_type_, config_.accepted_link_types)) {
        record.flags |= PacketFlagUnsupportedLinkType;
    }

    const auto payload = std::span<const std::byte>(
        reinterpret_cast<const std::byte*>(bytes),
        static_cast<std::size_t>(header.caplen));

    if (!ring_->try_push(record, payload)) {
        stats_.increment_app_ring_drops();
        if (!ring_full_reported_.exchange(true, std::memory_order_acq_rel)) {
            emit_error(make_capture_error(
                CaptureErrorCode::RingFull,
                CaptureSeverity::Warning,
                "Application packet ring is full; newest packets are being dropped.",
                config_.interface_name,
                0,
                {},
                true));
        }
    } else {
        stats_.increment_packets_enqueued();
        stats_.observe_ring_depth(ring_->depth());
    }

    if (config_.max_packets.has_value() &&
        stats().packets_seen >= config_.max_packets.value()) {
        request_stop();
    }
}

void CaptureEngine::emit_event(const CaptureEvent& event) const noexcept {
    if (!event_callback_) {
        return;
    }

    try {
        event_callback_(event);
    } catch (...) {
    }
}

void CaptureEngine::emit_error(const CaptureError& error) const noexcept {
    emit_event(CaptureEvent::from_error(error));
}

void CaptureEngine::update_kernel_stats_if_due() noexcept {
    if (config_.stats_interval.count() <= 0 || !handle_) {
        return;
    }

    const auto now = std::chrono::steady_clock::now();
    if (now < next_stats_at_) {
        return;
    }

    next_stats_at_ = now + config_.stats_interval;
    auto result = handle_->read_stats(config_.interface_name);
    if (std::holds_alternative<PcapKernelStats>(result)) {
        const auto kernel_stats = std::get<PcapKernelStats>(result);
        stats_.set_kernel_stats(kernel_stats.recv, kernel_stats.drop, kernel_stats.ifdrop);
    } else {
        emit_error(std::get<CaptureError>(std::move(result)));
    }
}

} // namespace pruftnet::capture

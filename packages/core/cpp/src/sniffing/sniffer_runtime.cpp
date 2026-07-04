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

void add_interface_stats(SnifferStatsSnapshot& aggregate, const InterfaceStatsSnapshot& interface_stats) {
    aggregate.packets_seen += interface_stats.packets_seen;
    aggregate.packets_enqueued += interface_stats.packets_enqueued;
    aggregate.packets_parsed += interface_stats.packets_parsed;
    aggregate.app_ring_drops += interface_stats.app_ring_drops;
    aggregate.pcap_dispatch_calls += interface_stats.pcap_dispatch_calls;
    aggregate.pcap_dispatch_errors += interface_stats.pcap_dispatch_errors;
    aggregate.pcap_recv += interface_stats.pcap_recv;
    aggregate.pcap_drop += interface_stats.pcap_drop;
    aggregate.pcap_ifdrop += interface_stats.pcap_ifdrop;
    aggregate.ring_depth += interface_stats.ring_depth;
    aggregate.ring_capacity += interface_stats.ring_capacity;
    aggregate.max_ring_depth += interface_stats.max_ring_depth;
}

} // namespace

struct SnifferRuntime::InterfaceCaptureContext {
    InterfaceCaptureContext(
        SnifferRuntime& owner,
        SnifferInterfaceOptions options,
        std::unique_ptr<PacketSource> source)
        : owner(&owner), options(std::move(options)), source(std::move(source)) {}

    SnifferRuntime* owner = nullptr;
    SnifferInterfaceOptions options;
    std::unique_ptr<PacketSource> source;
    std::unique_ptr<PacketRing> ring;
    InternalStats stats;
    std::thread capture_thread;
    std::atomic<bool> capture_done{false};
    std::atomic<bool> capture_thread_running{false};
    std::atomic<bool> ring_full_reported{false};
    int link_type = 0;
    std::chrono::steady_clock::time_point next_stats_at{};
};

SnifferRuntime::SnifferRuntime(
    SnifferOptions options,
    std::vector<std::unique_ptr<PacketSource>> packet_sources,
    SnifferOptionsValidation validation,
    PacketCallback packet_callback,
    EventCallback event_callback)
    : options_(std::move(options)),
      packet_source_count_(packet_sources.size()),
      validation_(validation),
      packet_callback_(std::move(packet_callback)),
      event_callback_(std::move(event_callback)) {
    interfaces_.reserve(options_.interfaces.size());
    for (std::size_t index = 0; index < options_.interfaces.size(); ++index) {
        auto interface_options = options_.interfaces[index];
        if (interface_options.id == kAutoInterfaceId) {
            interface_options.id = static_cast<std::uint32_t>(index);
            options_.interfaces[index].id = interface_options.id;
        }

        std::unique_ptr<PacketSource> source;
        if (index < packet_sources.size()) {
            source = std::move(packet_sources[index]);
        }

        interfaces_.push_back(std::make_unique<InterfaceCaptureContext>(
            *this,
            std::move(interface_options),
            std::move(source)));
    }
}

SnifferRuntime::~SnifferRuntime() { stop(); }

std::optional<SnifferError> SnifferRuntime::start() {
    std::unique_lock lock(lifecycle_mutex_);

    if (running_.load(std::memory_order_acquire)) {
        return make_sniffer_error(
            SnifferErrorCode::InvalidOptions,
            SnifferSeverity::Error,
            "SnifferRuntime is already running.");
    }

    if (auto error = validate_start_options()) {
        return error;
    }

    if (auto error = open_and_prepare_sources()) {
        close_sources();
        return error;
    }

    stop_requested_.store(false, std::memory_order_release);
    parser_thread_running_.store(false, std::memory_order_release);
    next_sequence_.store(1, std::memory_order_release);

    const auto next_stats_at = std::chrono::steady_clock::now() + options_.stats_poll_interval;
    for (auto& context : interfaces_) {
        context->stats.reset();
        context->capture_done.store(false, std::memory_order_release);
        context->capture_thread_running.store(false, std::memory_order_release);
        context->ring_full_reported.store(false, std::memory_order_release);
        context->next_stats_at = next_stats_at;
    }

    running_.store(true, std::memory_order_release);

    try {
        parser_thread_ = std::thread(&SnifferRuntime::parser_loop, this);
        for (auto& context : interfaces_) {
            context->capture_thread = std::thread(&SnifferRuntime::capture_loop, this, std::ref(*context));
        }
    } catch (const std::exception& error) {
        request_stop();
        mark_unstarted_captures_done();
        lock.unlock();
        join_threads();
        close_sources();
        return make_sniffer_error(
            SnifferErrorCode::ThreadStartFailed,
            SnifferSeverity::Fatal,
            std::string("Failed to start sniffer threads: ") + error.what());
    }

    return std::nullopt;
}

void SnifferRuntime::stop() noexcept {
    request_stop();

    const auto current_thread = std::this_thread::get_id();
    if (parser_thread_.joinable() && parser_thread_.get_id() == current_thread) {
        return;
    }

    for (const auto& context : interfaces_) {
        if (context->capture_thread.joinable() && context->capture_thread.get_id() == current_thread) {
            return;
        }
    }

    join_threads();
    close_sources();
}

bool SnifferRuntime::is_running() const noexcept { return running_.load(std::memory_order_acquire); }

SnifferStatsSnapshot SnifferRuntime::stats() const {
    SnifferStatsSnapshot snapshot;
    snapshot.interfaces.reserve(interfaces_.size());
    for (const auto& context : interfaces_) {
        const auto ring_depth = context->ring ? context->ring->depth() : 0;
        const auto ring_capacity = context->ring ? context->ring->capacity() : 0;
        auto interface_stats = context->stats.snapshot(
            context->options.id,
            context->source ? context->source->source_name() : context->options.name,
            context->link_type,
            ring_depth,
            ring_capacity,
            context->capture_thread_running.load(std::memory_order_relaxed));
        add_interface_stats(snapshot, interface_stats);
        snapshot.interfaces.push_back(std::move(interface_stats));
    }

    snapshot.parser_thread_running = parser_thread_running_.load(std::memory_order_relaxed);
    return snapshot;
}

void SnifferRuntime::packet_source_callback(
    void* user_data,
    const pcap_pkthdr& header,
    const unsigned char* bytes) noexcept {
    if (user_data == nullptr) {
        return;
    }

    auto* context = static_cast<InterfaceCaptureContext*>(user_data);
    if (context->owner == nullptr) {
        return;
    }

    context->owner->handle_packet(*context, header, bytes);
}

std::optional<SnifferError> SnifferRuntime::validate_start_options() const {
    if (!packet_callback_) {
        return make_sniffer_error(
            SnifferErrorCode::InvalidOptions,
            SnifferSeverity::Error,
            "SnifferRuntime requires a packet callback.");
    }

    if (auto error = validate_sniffer_options(options_, validation_)) {
        return error;
    }

    if (packet_source_count_ != options_.interfaces.size()) {
        return make_sniffer_error(
            SnifferErrorCode::InvalidOptions,
            SnifferSeverity::Error,
            "SnifferRuntime requires exactly one packet source per configured interface.");
    }

    for (const auto& context : interfaces_) {
        if (context->source == nullptr) {
            return make_sniffer_error(
                SnifferErrorCode::InvalidOptions,
                SnifferSeverity::Error,
                "SnifferRuntime requires a packet source for every configured interface.",
                context->options.name,
                0,
                {},
                false,
                context->options.id);
        }
    }

    return std::nullopt;
}

std::optional<SnifferError> SnifferRuntime::open_and_prepare_sources() {
    for (auto& context : interfaces_) {
        auto open_result = context->source->open();
        if (std::holds_alternative<SnifferError>(open_result)) {
            return with_interface_context(std::get<SnifferError>(std::move(open_result)), *context);
        }

        auto success = std::get<PacketSourceOpenSuccess>(std::move(open_result));
        for (const auto& warning : success.warnings) {
            emit_event(with_interface_context(warning, *context));
        }

        context->link_type = context->source->link_type();
        if (!is_link_type_accepted(context->link_type, options_.accepted_link_types)) {
            std::ostringstream message;
            message << "Unsupported link type " << link_type_name(context->link_type)
                    << ". Accepted link types: " << format_link_type_list(options_.accepted_link_types) << '.';

            return make_sniffer_error(
                SnifferErrorCode::UnsupportedLinkType,
                SnifferSeverity::Error,
                message.str(),
                context->source->source_name(),
                0,
                {},
                false,
                context->options.id);
        }

        const auto snapshot_length = context->source->snapshot_length();
        if (snapshot_length <= 0) {
            return make_sniffer_error(
                SnifferErrorCode::InvalidOptions,
                SnifferSeverity::Error,
                "Packet source snapshot length must be greater than zero.",
                context->source->source_name(),
                0,
                {},
                false,
                context->options.id);
        }

        try {
            context->ring = std::make_unique<PacketRing>(
                context->options.ring_slots,
                static_cast<std::size_t>(snapshot_length));
        } catch (const std::bad_alloc&) {
            return make_sniffer_error(
                SnifferErrorCode::AllocationFailed,
                SnifferSeverity::Fatal,
                "Failed to allocate packet ring.",
                context->source->source_name(),
                0,
                {},
                false,
                context->options.id);
        } catch (const std::exception& error) {
            return make_sniffer_error(
                SnifferErrorCode::InvalidOptions,
                SnifferSeverity::Error,
                error.what(),
                context->source->source_name(),
                0,
                {},
                false,
                context->options.id);
        }
    }

    return std::nullopt;
}

void SnifferRuntime::close_sources() noexcept {
    for (auto& context : interfaces_) {
        if (context->source) {
            context->source->close();
        }
    }
}

void SnifferRuntime::request_stop() noexcept {
    stop_requested_.store(true, std::memory_order_release);

    for (auto& context : interfaces_) {
        if (context->source) {
            context->source->interrupt();
        }

        if (context->ring) {
            context->ring->notify_all();
        }
    }

    parser_wait_.notify_all();
}

void SnifferRuntime::join_threads() noexcept {
    std::lock_guard lock(lifecycle_mutex_);

    for (auto& context : interfaces_) {
        if (context->capture_thread.joinable()) {
            context->capture_thread.join();
        }
    }

    if (parser_thread_.joinable()) {
        parser_thread_.join();
    }

    bool capture_threads_joined = true;
    for (const auto& context : interfaces_) {
        if (context->capture_thread.joinable()) {
            capture_threads_joined = false;
            break;
        }
    }

    if (capture_threads_joined && !parser_thread_.joinable()) {
        running_.store(false, std::memory_order_release);
    }
}

void SnifferRuntime::mark_unstarted_captures_done() noexcept {
    for (auto& context : interfaces_) {
        if (!context->capture_thread.joinable()) {
            context->capture_done.store(true, std::memory_order_release);
            if (context->ring) {
                context->ring->notify_all();
            }
        }
    }

    parser_wait_.notify_all();
}

void SnifferRuntime::capture_loop(InterfaceCaptureContext& context) noexcept {
    context.capture_thread_running.store(true, std::memory_order_release);

    try {
        while (!stop_requested_.load(std::memory_order_acquire)) {
            context.stats.increment_pcap_dispatch_calls();
            const auto result = context.source->dispatch(
                context.options.pcap_dispatch_batch_size,
                &SnifferRuntime::packet_source_callback,
                &context);

            switch (result.status) {
            case PacketSourceDispatchStatus::PacketsRead:
            case PacketSourceDispatchStatus::NoPacketsAvailable:
                update_kernel_stats_if_due(context);
                continue;
            case PacketSourceDispatchStatus::EndOfInput:
            case PacketSourceDispatchStatus::Interrupted:
                break;
            case PacketSourceDispatchStatus::Error:
                context.stats.increment_pcap_dispatch_errors();
                emit_error(make_sniffer_error(
                    SnifferErrorCode::DispatchFailed,
                    SnifferSeverity::Error,
                    "pcap_dispatch failed.",
                    context.source->source_name(),
                    result.pcap_status,
                    result.error_message,
                    false,
                    context.options.id));
                break;
            }

            break;
        }
    } catch (const std::exception& error) {
        emit_error(make_sniffer_error(
            SnifferErrorCode::InternalInvariantViolation,
            SnifferSeverity::Fatal,
            std::string("Unhandled exception in capture thread: ") + error.what(),
            context.source ? context.source->source_name() : context.options.name,
            0,
            {},
            false,
            context.options.id));
    } catch (...) {
        emit_error(make_sniffer_error(
            SnifferErrorCode::InternalInvariantViolation,
            SnifferSeverity::Fatal,
            "Unknown exception in capture thread.",
            context.source ? context.source->source_name() : context.options.name,
            0,
            {},
            false,
            context.options.id));
    }

    update_kernel_stats_if_due(context);
    context.capture_done.store(true, std::memory_order_release);
    context.capture_thread_running.store(false, std::memory_order_release);

    if (context.ring) {
        context.ring->notify_all();
    }

    parser_wait_.notify_all();
}

void SnifferRuntime::parser_loop() noexcept {
    parser_thread_running_.store(true, std::memory_order_release);

    try {
        std::size_t next_interface_index = 0;
        while (!all_capture_done() || any_ring_has_packets()) {
            bool parsed_any = false;

            for (std::size_t offset = 0; offset < interfaces_.size(); ++offset) {
                const auto index = (next_interface_index + offset) % interfaces_.size();
                auto& context = *interfaces_[index];
                if (!context.ring) {
                    continue;
                }

                if (auto queued = context.ring->peek()) {
                    RawPacketView raw_packet;
                    raw_packet.metadata = queued->metadata;
                    raw_packet.bytes = queued->bytes;

                    const auto parsed_packet = parser_.parse(raw_packet);
                    context.stats.increment_packets_parsed();

                    packet_callback_(raw_packet, parsed_packet, stats());
                    context.ring->pop();
                    next_interface_index = (index + 1) % interfaces_.size();
                    parsed_any = true;
                    break;
                }
            }

            if (parsed_any) {
                continue;
            }

            std::unique_lock wait_lock(parser_wait_mutex_);
            parser_wait_.wait(wait_lock, [this] {
                return all_capture_done() || any_ring_has_packets();
            });
        }
    } catch (const std::exception& error) {
        emit_error(make_sniffer_error(
            SnifferErrorCode::InternalInvariantViolation,
            SnifferSeverity::Fatal,
            std::string("Unhandled exception in parser thread: ") + error.what()));
        request_stop();
    } catch (...) {
        emit_error(make_sniffer_error(
            SnifferErrorCode::InternalInvariantViolation,
            SnifferSeverity::Fatal,
            "Unknown exception in parser thread."));
        request_stop();
    }

    parser_thread_running_.store(false, std::memory_order_release);
    running_.store(false, std::memory_order_release);
}

void SnifferRuntime::handle_packet(
    InterfaceCaptureContext& context,
    const pcap_pkthdr& header,
    const unsigned char* bytes) noexcept {
    context.stats.increment_packets_seen();

    if (bytes == nullptr && header.caplen > 0) {
        emit_error(make_sniffer_error(
            SnifferErrorCode::DispatchFailed,
            SnifferSeverity::Warning,
            "pcap callback produced a null packet payload.",
            context.source->source_name(),
            0,
            {},
            true,
            context.options.id));
        return;
    }

    PacketMetadata metadata;
    metadata.sequence = next_sequence_.fetch_add(1, std::memory_order_relaxed);
    metadata.timestamp_ns = packet_timestamp_ns(header, context.source->timestamp_precision());
    metadata.interface_id = context.options.id;
    metadata.captured_len = header.caplen;
    metadata.wire_len = header.len;
    metadata.link_type = static_cast<std::uint32_t>(context.link_type);
    metadata.flags = PacketFlagNone;

    if (header.caplen < header.len) {
        metadata.flags |= PacketFlagTruncated;
    }

    const auto payload = std::span<const std::byte>(
        reinterpret_cast<const std::byte*>(bytes),
        static_cast<std::size_t>(header.caplen));

    if (!context.ring->try_push(metadata, payload)) {
        context.stats.increment_app_ring_drops();
        if (!context.ring_full_reported.exchange(true, std::memory_order_acq_rel)) {
            emit_error(make_sniffer_error(
                SnifferErrorCode::RingFull,
                SnifferSeverity::Warning,
                "Application packet ring is full or packet exceeds the ring slot size; newest packets are being dropped.",
                context.source->source_name(),
                0,
                {},
                true,
                context.options.id));
        }
        return;
    }

    context.stats.increment_packets_enqueued();
    context.stats.observe_ring_depth(context.ring->depth());
    parser_wait_.notify_one();
}

void SnifferRuntime::update_kernel_stats_if_due(InterfaceCaptureContext& context) noexcept {
    if (options_.stats_poll_interval.count() <= 0 || !context.source) {
        return;
    }

    const auto now = std::chrono::steady_clock::now();
    if (now < context.next_stats_at) {
        return;
    }

    context.next_stats_at = now + options_.stats_poll_interval;
    auto result = context.source->read_stats();
    if (std::holds_alternative<PcapKernelStats>(result)) {
        const auto kernel_stats = std::get<PcapKernelStats>(result);
        context.stats.set_kernel_stats(kernel_stats.recv, kernel_stats.drop, kernel_stats.ifdrop);
    } else {
        emit_error(with_interface_context(std::get<SnifferError>(std::move(result)), context));
    }
}

bool SnifferRuntime::all_capture_done() const noexcept {
    for (const auto& context : interfaces_) {
        if (!context->capture_done.load(std::memory_order_acquire)) {
            return false;
        }
    }

    return true;
}

bool SnifferRuntime::any_ring_has_packets() const noexcept {
    for (const auto& context : interfaces_) {
        if (context->ring && !context->ring->empty()) {
            return true;
        }
    }

    return false;
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

SnifferEvent SnifferRuntime::with_interface_context(
    const SnifferEvent& event,
    const InterfaceCaptureContext& context) const {
    auto contextual = event;
    if (contextual.interface_id == kAutoInterfaceId || (contextual.interface_id == 0 && context.options.id != 0)) {
        contextual.interface_id = context.options.id;
    }
    if (contextual.interface_name.empty()) {
        contextual.interface_name = context.source ? context.source->source_name() : context.options.name;
    }
    return contextual;
}

SnifferError SnifferRuntime::with_interface_context(
    SnifferError error,
    const InterfaceCaptureContext& context) const {
    if (error.interface_id == kAutoInterfaceId || (error.interface_id == 0 && context.options.id != 0)) {
        error.interface_id = context.options.id;
    }
    if (error.interface_name.empty()) {
        error.interface_name = context.source ? context.source->source_name() : context.options.name;
    }
    return error;
}

} // namespace pruftnet::sniffing::internal

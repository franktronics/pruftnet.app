#include "sniffing/sniffer_runtime.hpp"

#include <exception>
#include <limits>
#include <new>
#include <sstream>
#include <stdexcept>
#include <utility>
#include <variant>

#include "sniffing/link_type.hpp"
#include "sniffing/packet_identity.hpp"

namespace pruftnet::sniffing::internal {
namespace {

std::uint64_t packet_timestamp_ns(const pcap_pkthdr& header, TimestampPrecision precision) {
    const auto seconds = static_cast<std::uint64_t>(header.ts.tv_sec);
    const auto subsecond = static_cast<std::uint64_t>(header.ts.tv_usec);
    return seconds * 1'000'000'000ULL +
           (precision == TimestampPrecision::Nanoseconds ? subsecond : subsecond * 1'000ULL);
}

void add_interface_stats(SnifferStatsSnapshot& aggregate, const InterfaceStatsSnapshot& interface_stats) {
    aggregate.packets_observed += interface_stats.packets_observed;
    aggregate.capture_queue_accepted += interface_stats.capture_queue_accepted;
    aggregate.capture_queue_full_drops += interface_stats.capture_queue_full_drops;
    aggregate.capture_queue_oversize_drops += interface_stats.capture_queue_oversize_drops;
    aggregate.invalid_callback_drops += interface_stats.invalid_callback_drops;
    aggregate.pcap_dispatch_calls += interface_stats.pcap_dispatch_calls;
    aggregate.pcap_dispatch_errors += interface_stats.pcap_dispatch_errors;
    aggregate.pcap_stats_read_failures += interface_stats.pcap_stats_read_failures;
    aggregate.pcap_received += interface_stats.pcap_received;
    aggregate.pcap_kernel_drops += interface_stats.pcap_kernel_drops;
    aggregate.pcap_interface_drops += interface_stats.pcap_interface_drops;
    aggregate.capture_queue_depth += interface_stats.capture_queue_depth;
    aggregate.capture_queue_capacity_packets += interface_stats.capture_queue_capacity_packets;
    aggregate.capture_queue_capacity_bytes += interface_stats.capture_queue_capacity_bytes;
    aggregate.capture_queue_bytes += interface_stats.capture_queue_bytes;
    aggregate.capture_queue_max_depth += interface_stats.capture_queue_max_depth;
    aggregate.capture_queue_max_bytes += interface_stats.capture_queue_max_bytes;
}

bool checked_multiply(std::size_t left, std::size_t right, std::size_t& result) noexcept {
    if (left != 0 && right > std::numeric_limits<std::size_t>::max() / left) {
        return false;
    }

    result = left * right;
    return true;
}

bool checked_add(std::size_t left, std::size_t right, std::size_t& result) noexcept {
    if (right > std::numeric_limits<std::size_t>::max() - left) {
        return false;
    }

    result = left + right;
    return true;
}

std::optional<std::size_t> estimated_ring_bytes(std::size_t capacity, std::size_t byte_capacity) noexcept {
    std::size_t slot_count = 0;
    if (!checked_add(capacity, 1, slot_count)) {
        return std::nullopt;
    }

    std::size_t metadata_storage = 0;
    constexpr auto descriptor_bytes = sizeof(PacketMetadata) + sizeof(std::size_t) * 3;
    if (!checked_multiply(slot_count, descriptor_bytes, metadata_storage)) {
        return std::nullopt;
    }

    std::size_t total = byte_capacity;
    if (!checked_add(total, metadata_storage, total)) {
        return std::nullopt;
    }

    return total;
}

parsing::RegistrySnapshotPtr make_runtime_registry() {
    auto result = parsing::make_core_registry();
    if (auto* registry = std::get_if<parsing::RegistrySnapshot>(&result)) {
        return std::make_shared<const parsing::RegistrySnapshot>(std::move(*registry));
    }
    throw std::logic_error("Failed to bootstrap the built-in parser registry.");
}

SnifferErrorCode spool_error_code(capture::SpoolFailureReason reason) {
    switch (reason) {
    case capture::SpoolFailureReason::DirectoryUnavailable:
    case capture::SpoolFailureReason::OpenFailed:
        return SnifferErrorCode::SpoolOpenFailed;
    case capture::SpoolFailureReason::FlushFailed:
        return SnifferErrorCode::SpoolFlushFailed;
    case capture::SpoolFailureReason::FinalizeFailed:
        return SnifferErrorCode::SpoolFinalizeFailed;
    case capture::SpoolFailureReason::QuotaExceeded:
        return SnifferErrorCode::SpoolQuotaExceeded;
    case capture::SpoolFailureReason::ShortWrite:
    case capture::SpoolFailureReason::WriteFailed:
    case capture::SpoolFailureReason::InvalidPacket:
    case capture::SpoolFailureReason::CorruptData:
        return SnifferErrorCode::SpoolWriteFailed;
    }
    return SnifferErrorCode::SpoolWriteFailed;
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
    std::atomic<bool> oversize_reported{false};
    int link_type = 0;
    int snapshot_length = 0;
    std::chrono::steady_clock::time_point next_stats_at{};
};

SnifferRuntime::SnifferRuntime(
    SnifferOptions options,
    std::vector<std::unique_ptr<PacketSource>> packet_sources,
    SnifferOptionsValidation validation,
    PacketCallback packet_callback,
    EventCallback event_callback,
    capture::SpoolSinkFactory spool_sink_factory)
    : registry_(make_runtime_registry()),
      catalog_(parsing::internal::make_core_dissector_catalog(registry_)),
      options_(std::move(options)),
      packet_source_count_(packet_sources.size()),
      validation_(validation),
      packet_callback_(std::move(packet_callback)),
      event_callback_(std::move(event_callback)),
      spool_sink_factory_(std::move(spool_sink_factory)),
      parser_(catalog_) {
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

    if (running_.load(std::memory_order_acquire) || stopping_) {
        return make_sniffer_error(
            SnifferErrorCode::InvalidOptions,
            SnifferSeverity::Error,
            "SnifferRuntime is already running or stopping.");
    }

    if (has_joinable_threads()) {
        stopping_ = true;
        lock.unlock();
        join_threads();
        lock.lock();
        close_sources();
        stopping_ = false;
        lifecycle_condition_.notify_all();
        if (running_.load(std::memory_order_acquire)) {
            return make_sniffer_error(
                SnifferErrorCode::InvalidOptions,
                SnifferSeverity::Error,
                "SnifferRuntime was restarted concurrently.");
        }
    }

    if (auto error = validate_start_options()) {
        return error;
    }

    std::vector<SnifferEvent> startup_events;
    if (auto error = open_and_prepare_sources(startup_events)) {
        close_sources();
        lock.unlock();
        for (const auto& event : startup_events) {
            emit_event(event);
        }
        return error;
    }

    const auto next_capture_id = make_capture_id();
    if (!next_capture_id.has_value()) {
        close_sources();
        lock.unlock();
        for (const auto& event : startup_events) {
            emit_event(event);
        }
        return make_sniffer_error(
            SnifferErrorCode::CaptureIdentityUnavailable,
            SnifferSeverity::Fatal,
            "The operating system could not generate a capture identifier.");
    }

    capture::PcapngSpoolOptions spool_options;
    spool_options.directory = options_.spool_directory;
    spool_options.max_total_bytes = options_.spool_max_total_bytes;
    spool_options.segment_bytes = options_.spool_segment_bytes;
    spool_options.max_segments = options_.spool_max_segments;
    spool_options.ring_mode = options_.spool_ring_mode;
    spool_options.temporary = options_.spool_temporary;
    spool_options.flush_interval = options_.spool_flush_interval;
    spool_options.flush_bytes = options_.spool_flush_bytes;
    std::vector<capture::SpoolInterface> spool_interfaces;
    spool_interfaces.reserve(interfaces_.size());
    for (const auto& context : interfaces_) {
        spool_interfaces.push_back({
            context->options.id,
            context->source ? context->source->source_name() : context->options.name,
            static_cast<std::uint16_t>(context->link_type),
            static_cast<std::uint32_t>(context->snapshot_length),
            static_cast<std::uint8_t>(context->source->timestamp_precision() ==
                                              TimestampPrecision::Nanoseconds ? 9 : 6),
        });
    }
    auto created_spool = capture::PcapngSpool::create(
        std::move(spool_options), *next_capture_id, std::move(spool_interfaces),
        spool_sink_factory_);
    if (const auto* spool_error = std::get_if<capture::SpoolError>(&created_spool)) {
        close_sources();
        return make_sniffer_error(spool_error_code(spool_error->reason),
                                  SnifferSeverity::Fatal, spool_error->message);
    }
    spool_ = std::move(std::get<std::unique_ptr<capture::PcapngSpool>>(created_spool));

    stop_requested_.store(false, std::memory_order_release);
    writer_thread_running_.store(false, std::memory_order_release);
    analyzer_running_.store(false, std::memory_order_release);
    writer_done_.store(false, std::memory_order_release);
    spool_failed_.store(false, std::memory_order_release);
    packets_available_for_analysis_.store(0, std::memory_order_release);
    packets_analyzed_.store(0, std::memory_order_release);
    analysis_backlog_bytes_.store(0, std::memory_order_release);
    analysis_errors_.store(0, std::memory_order_release);
    analysis_resource_limits_.store(0, std::memory_order_release);
    analysis_gap_count_.store(0, std::memory_order_release);
    analysis_evicted_before_analysis_.store(0, std::memory_order_release);
    analysis_rejects_.store(0, std::memory_order_release);
    writer_in_flight_.store(0, std::memory_order_release);
    terminal_write_losses_.store(0, std::memory_order_release);
    active_capture_id_ = *next_capture_id;
    next_packet_id_.store(1, std::memory_order_release);
    {
        const std::lock_guard gate_lock(start_gate_mutex_);
        start_gate_released_ = false;
        start_gate_success_ = false;
    }

    const auto next_stats_at = std::chrono::steady_clock::now() + options_.stats_poll_interval;
    for (auto& context : interfaces_) {
        context->stats.reset();
        context->capture_done.store(false, std::memory_order_release);
        context->capture_thread_running.store(false, std::memory_order_release);
        context->ring_full_reported.store(false, std::memory_order_release);
        context->oversize_reported.store(false, std::memory_order_release);
        context->next_stats_at = next_stats_at;
    }

    running_.store(true, std::memory_order_release);

    try {
        writer_thread_ = std::thread(&SnifferRuntime::writer_loop, this);
        analyzer_thread_ = std::thread(&SnifferRuntime::analyzer_loop, this);
        for (auto& context : interfaces_) {
            context->capture_thread = std::thread(&SnifferRuntime::capture_loop, this, std::ref(*context));
        }
    } catch (const std::exception& error) {
        release_start_gate(false);
        request_stop();
        mark_unstarted_captures_done();
        stopping_ = true;
        lock.unlock();
        join_threads();
        lock.lock();
        close_sources();
        stopping_ = false;
        lifecycle_condition_.notify_all();
        lock.unlock();
        for (const auto& event : startup_events) {
            emit_event(event);
        }
        return make_sniffer_error(
            SnifferErrorCode::ThreadStartFailed,
            SnifferSeverity::Fatal,
            std::string("Failed to start sniffer threads: ") + error.what());
    }

    {
        const std::lock_guard capture_lock(capture_id_mutex_);
        capture_id_ = next_capture_id;
    }
    release_start_gate(true);
    lock.unlock();
    for (const auto& event : startup_events) {
        emit_event(event);
    }

    return std::nullopt;
}

void SnifferRuntime::stop() noexcept {
    std::unique_lock lock(lifecycle_mutex_);
    const auto current_thread = std::this_thread::get_id();
    const auto called_from_runtime_thread = [&] {
        if ((writer_thread_.joinable() && writer_thread_.get_id() == current_thread) ||
            (analyzer_thread_.joinable() && analyzer_thread_.get_id() == current_thread)) {
            return true;
        }
        for (const auto& context : interfaces_) {
            if (context->capture_thread.joinable() && context->capture_thread.get_id() == current_thread) {
                return true;
            }
        }
        return false;
    }();

    if (stopping_) {
        if (called_from_runtime_thread) {
            return;
        }
        lifecycle_condition_.wait(lock, [this] {
            return !stopping_;
        });
    }

    request_stop();

    if (called_from_runtime_thread) {
        return;
    }
    stopping_ = true;
    lock.unlock();
    join_threads();
    lock.lock();
    close_sources();
    stopping_ = false;
    lifecycle_condition_.notify_all();
}

bool SnifferRuntime::is_running() const noexcept { return running_.load(std::memory_order_acquire); }

std::optional<CaptureId> SnifferRuntime::capture_id() const {
    const std::lock_guard lock(capture_id_mutex_);
    return capture_id_;
}

parsing::RegistryRevision SnifferRuntime::registry_revision() const noexcept { return registry_->revision(); }

SnifferStatsSnapshot SnifferRuntime::stats() const {
    const std::lock_guard lock(lifecycle_mutex_);
    SnifferStatsSnapshot snapshot;
    snapshot.interfaces.reserve(interfaces_.size());
    for (const auto& context : interfaces_) {
        const auto ring_depth = context->ring ? context->ring->depth() : 0;
        const auto ring_capacity = context->ring ? context->ring->capacity() : 0;
        const auto ring_bytes = context->ring ? context->ring->bytes() : 0;
        const auto ring_byte_capacity = context->ring ? context->ring->byte_capacity() : 0;
        auto interface_stats = context->stats.snapshot(
            context->options.id,
            context->source ? context->source->source_name() : context->options.name,
            context->link_type,
            ring_depth,
            ring_capacity,
            ring_bytes,
            ring_byte_capacity,
            context->capture_thread_running.load(std::memory_order_relaxed));
        add_interface_stats(snapshot, interface_stats);
        snapshot.interfaces.push_back(std::move(interface_stats));
    }

    if (spool_) {
        const auto spool_stats = spool_->stats();
        snapshot.spool_bytes_written = spool_stats.bytes_written;
        snapshot.spool_bytes_retained = spool_stats.bytes_retained;
        snapshot.spool_quota_bytes = spool_stats.quota_bytes;
        snapshot.spool_evicted_packets = spool_stats.evicted_packets;
        snapshot.spool_evicted_bytes = spool_stats.evicted_bytes;
        snapshot.spool_write_failures = spool_stats.write_failures;
        snapshot.spool_flush_failures = spool_stats.flush_failures;
        snapshot.last_committed_packet_id = spool_stats.last_committed_packet_id;
        snapshot.spool_segments = spool_stats.segments;
    }
    snapshot.packets_available_for_analysis = packets_available_for_analysis_.load(std::memory_order_relaxed);
    snapshot.packets_persisted = snapshot.packets_available_for_analysis;
    snapshot.packets_analyzed = packets_analyzed_.load(std::memory_order_relaxed);
    snapshot.analysis_evicted_before_analysis = analysis_evicted_before_analysis_.load(std::memory_order_relaxed);
    snapshot.analysis_rejects = analysis_rejects_.load(std::memory_order_relaxed);
    const auto resolved_analysis = std::min(
        snapshot.packets_persisted,
        snapshot.packets_analyzed + snapshot.analysis_evicted_before_analysis +
            snapshot.analysis_rejects);
    snapshot.analysis_backlog_packets = snapshot.packets_persisted - resolved_analysis;
    snapshot.analysis_backlog_bytes = analysis_backlog_bytes_.load(std::memory_order_relaxed);
    snapshot.analysis_errors = analysis_errors_.load(std::memory_order_relaxed);
    snapshot.analysis_resource_limits = analysis_resource_limits_.load(std::memory_order_relaxed);
    snapshot.analysis_gap_count = analysis_gap_count_.load(std::memory_order_relaxed);
    snapshot.writer_in_flight = writer_in_flight_.load(std::memory_order_relaxed);
    snapshot.terminal_write_losses = terminal_write_losses_.load(std::memory_order_relaxed);
    snapshot.writer_thread_running = writer_thread_running_.load(std::memory_order_relaxed);
    snapshot.analyzer_running = analyzer_running_.load(std::memory_order_relaxed);
    return snapshot;
}

capture::PacketSpoolLookup
SnifferRuntime::persisted_packet(const PacketKey& key) const {
    const std::lock_guard lock(lifecycle_mutex_);
    return spool_ ? spool_->lookup(key) : capture::PacketSpoolLookup{};
}

std::vector<std::filesystem::path> SnifferRuntime::spool_paths() const {
    const std::lock_guard lock(lifecycle_mutex_);
    return spool_ ? spool_->segment_paths() : std::vector<std::filesystem::path>{};
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

std::optional<SnifferError> SnifferRuntime::open_and_prepare_sources(std::vector<SnifferEvent>& startup_events) {
    std::size_t total_ring_bytes = 0;

    for (auto& context : interfaces_) {
        auto open_result = context->source->open();
        if (std::holds_alternative<SnifferError>(open_result)) {
            return with_interface_context(std::get<SnifferError>(std::move(open_result)), *context);
        }

        auto success = std::get<PacketSourceOpenSuccess>(std::move(open_result));
        for (const auto& warning : success.warnings) {
            startup_events.push_back(with_interface_context(warning, *context));
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

        context->snapshot_length = context->source->snapshot_length();
        if (context->snapshot_length <= 0) {
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

        const auto estimated_bytes = estimated_ring_bytes(
            context->options.ring_slots,
            context->options.ring_bytes);
        if (!estimated_bytes.has_value()) {
            return make_sniffer_error(
                SnifferErrorCode::InvalidOptions,
                SnifferSeverity::Error,
                "Packet ring memory estimate overflowed.",
                context->source->source_name(),
                0,
                {},
                false,
                context->options.id);
        }

        if (!checked_add(total_ring_bytes, *estimated_bytes, total_ring_bytes)) {
            return make_sniffer_error(
                SnifferErrorCode::InvalidOptions,
                SnifferSeverity::Error,
                "Total packet ring memory estimate overflowed.");
        }
    }

    if (options_.max_total_ring_bytes != 0 && total_ring_bytes > options_.max_total_ring_bytes) {
        std::ostringstream message;
        message << "Packet ring memory budget exceeded. Estimated " << total_ring_bytes
                << " bytes, budget " << options_.max_total_ring_bytes << " bytes.";
        return make_sniffer_error(
            SnifferErrorCode::MemoryBudgetExceeded,
            SnifferSeverity::Error,
            message.str());
    }

    for (auto& context : interfaces_) {
        try {
            context->ring = std::make_unique<PacketRing>(
                context->options.ring_slots,
                context->options.ring_bytes,
                static_cast<std::size_t>(context->snapshot_length));
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

    notify_writer();
    notify_analyzer();
}

void SnifferRuntime::join_threads() noexcept {
    for (auto& context : interfaces_) {
        if (context->capture_thread.joinable()) {
            context->capture_thread.join();
        }
    }

    notify_writer();
    if (writer_thread_.joinable()) {
        writer_thread_.join();
    }
    notify_analyzer();
    if (analyzer_thread_.joinable()) {
        analyzer_thread_.join();
    }

    bool capture_threads_joined = true;
    for (const auto& context : interfaces_) {
        if (context->capture_thread.joinable()) {
            capture_threads_joined = false;
            break;
        }
    }

    if (capture_threads_joined && !writer_thread_.joinable() && !analyzer_thread_.joinable()) {
        running_.store(false, std::memory_order_release);
    }
}

bool SnifferRuntime::has_joinable_threads() const noexcept {
    if (writer_thread_.joinable() || analyzer_thread_.joinable()) {
        return true;
    }
    for (const auto& context : interfaces_) {
        if (context->capture_thread.joinable()) {
            return true;
        }
    }
    return false;
}

bool SnifferRuntime::wait_for_start_gate() noexcept {
    std::unique_lock lock(start_gate_mutex_);
    start_gate_condition_.wait(lock, [this] {
        return start_gate_released_;
    });
    return start_gate_success_;
}

void SnifferRuntime::release_start_gate(bool success) noexcept {
    {
        const std::lock_guard lock(start_gate_mutex_);
        start_gate_success_ = success;
        start_gate_released_ = true;
    }
    start_gate_condition_.notify_all();
}

void SnifferRuntime::notify_writer() noexcept {
    writer_wakeup_generation_.fetch_add(1, std::memory_order_release);
    writer_wakeup_generation_.notify_all();
}

void SnifferRuntime::notify_analyzer() noexcept {
    analyzer_wakeup_generation_.fetch_add(1, std::memory_order_release);
    analyzer_wakeup_generation_.notify_all();
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

    notify_writer();
}

void SnifferRuntime::capture_loop(InterfaceCaptureContext& context) noexcept {
    context.capture_thread_running.store(true, std::memory_order_release);

    try {
        if (!wait_for_start_gate()) {
            context.capture_done.store(true, std::memory_order_release);
            context.capture_thread_running.store(false, std::memory_order_release);
            notify_writer();
            return;
        }
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

    update_kernel_stats(context);
    context.capture_done.store(true, std::memory_order_release);
    context.capture_thread_running.store(false, std::memory_order_release);

    if (context.ring) {
        context.ring->notify_all();
    }

    notify_writer();
}

void SnifferRuntime::publish_committed(
    const std::vector<capture::CommittedPacket>& packets) noexcept {
    if (packets.empty()) return;
    writer_in_flight_.fetch_sub(packets.size(), std::memory_order_relaxed);
    packets_available_for_analysis_.fetch_add(packets.size(), std::memory_order_relaxed);
    std::uint64_t bytes = 0;
    for (const auto& packet : packets) bytes += packet.metadata.captured_len;
    analysis_backlog_bytes_.fetch_add(bytes, std::memory_order_relaxed);
    notify_analyzer();
}

void SnifferRuntime::fail_spool(const capture::SpoolError& error) noexcept {
    if (spool_failed_.exchange(true, std::memory_order_acq_rel)) return;
    const auto in_flight = writer_in_flight_.exchange(0, std::memory_order_acq_rel);
    terminal_write_losses_.fetch_add(in_flight, std::memory_order_relaxed);
    emit_error(make_sniffer_error(spool_error_code(error.reason),
                                  SnifferSeverity::Fatal, error.message));
    request_stop();
}

void SnifferRuntime::account_unwritten_queues() noexcept {
    for (auto& context : interfaces_) {
        while (context->ring && context->ring->peek()) {
            context->ring->pop();
            terminal_write_losses_.fetch_add(1, std::memory_order_relaxed);
        }
    }
}

void SnifferRuntime::writer_loop() noexcept {
    writer_thread_running_.store(true, std::memory_order_release);
    try {
        if (!wait_for_start_gate()) {
            writer_done_.store(true, std::memory_order_release);
            writer_thread_running_.store(false, std::memory_order_release);
            notify_analyzer();
            return;
        }
        std::size_t next_interface_index = 0;
        while (!all_capture_done() || any_ring_has_packets()) {
            bool wrote_any = false;
            for (std::size_t offset = 0; offset < interfaces_.size(); ++offset) {
                const auto index = (next_interface_index + offset) % interfaces_.size();
                auto& context = *interfaces_[index];
                if (!context.ring) continue;
                const auto queued = context.ring->peek();
                if (!queued) continue;

                writer_in_flight_.fetch_add(1, std::memory_order_relaxed);
                const auto append_error = spool_->append(queued->metadata, queued->bytes);
                context.ring->pop();
                if (append_error) {
                    fail_spool(*append_error);
                    account_unwritten_queues();
                    break;
                }
                const auto committed = spool_->flush_if_due();
                if (const auto* error = std::get_if<capture::SpoolError>(&committed)) {
                    fail_spool(*error);
                    account_unwritten_queues();
                    break;
                }
                publish_committed(std::get<std::vector<capture::CommittedPacket>>(committed));
                next_interface_index = (index + 1) % interfaces_.size();
                wrote_any = true;
                break;
            }
            if (spool_failed_.load(std::memory_order_acquire)) break;
            if (wrote_any) continue;

            const auto committed = spool_->flush_if_due();
            if (const auto* error = std::get_if<capture::SpoolError>(&committed)) {
                fail_spool(*error);
                account_unwritten_queues();
                break;
            }
            publish_committed(std::get<std::vector<capture::CommittedPacket>>(committed));
            const auto generation = writer_wakeup_generation_.load(std::memory_order_acquire);
            if (!all_capture_done() && !any_ring_has_packets())
                writer_wakeup_generation_.wait(generation, std::memory_order_acquire);
        }
        if (!spool_failed_.load(std::memory_order_acquire)) {
            const auto finalized = spool_->finalize();
            if (const auto* error = std::get_if<capture::SpoolError>(&finalized))
                fail_spool(*error);
            else
                publish_committed(std::get<std::vector<capture::CommittedPacket>>(finalized));
        }
    } catch (const std::exception& error) {
        fail_spool({capture::SpoolFailureReason::WriteFailed,
                    std::string("Unhandled exception in pcapng writer: ") + error.what(), 0});
        account_unwritten_queues();
    } catch (...) {
        fail_spool({capture::SpoolFailureReason::WriteFailed,
                    "Unknown exception in pcapng writer.", 0});
        account_unwritten_queues();
    }
    writer_done_.store(true, std::memory_order_release);
    writer_thread_running_.store(false, std::memory_order_release);
    notify_analyzer();
    if (!analyzer_running_.load(std::memory_order_acquire))
        running_.store(false, std::memory_order_release);
}

void SnifferRuntime::analyzer_loop() noexcept {
    analyzer_running_.store(true, std::memory_order_release);
    std::uint64_t ordinal = 0;
    try {
        if (!wait_for_start_gate()) {
            analyzer_running_.store(false, std::memory_order_release);
            return;
        }
        while (!writer_done_.load(std::memory_order_acquire) ||
               (spool_ && ordinal < spool_->committed_count())) {
            const auto committed = spool_->committed_packet(ordinal);
            if (!committed) {
                const auto generation = analyzer_wakeup_generation_.load(std::memory_order_acquire);
                if (!writer_done_.load(std::memory_order_acquire) &&
                    ordinal >= spool_->committed_count())
                    analyzer_wakeup_generation_.wait(generation, std::memory_order_acquire);
                continue;
            }

            const auto lookup = spool_->lookup_ordinal(ordinal);
            const auto complete_backlog_bytes = [&] {
                auto backlog_bytes = analysis_backlog_bytes_.load(std::memory_order_relaxed);
                while (!analysis_backlog_bytes_.compare_exchange_weak(
                    backlog_bytes,
                    backlog_bytes > committed->metadata.captured_len
                        ? backlog_bytes - committed->metadata.captured_len
                        : 0,
                    std::memory_order_relaxed)) {
                }
            };
            ++ordinal;
            if (lookup.status == capture::PacketSpoolLookupStatus::Evicted) {
                analysis_gap_count_.fetch_add(1, std::memory_order_relaxed);
                analysis_evicted_before_analysis_.fetch_add(1, std::memory_order_relaxed);
                complete_backlog_bytes();
                continue;
            }
            if (lookup.status != capture::PacketSpoolLookupStatus::Found || !lookup.packet) {
                analysis_errors_.fetch_add(1, std::memory_order_relaxed);
                analysis_gap_count_.fetch_add(1, std::memory_order_relaxed);
                analysis_rejects_.fetch_add(1, std::memory_order_relaxed);
                complete_backlog_bytes();
                continue;
            }

            const auto& persisted = *lookup.packet;
            const RawPacketView raw_packet{persisted.metadata, persisted.bytes};
            try {
                auto parsed_packet = parser_.parse(raw_packet);
                if (parsed_packet.condition() == parsing::ParseCondition::ResourceLimit)
                    analysis_resource_limits_.fetch_add(1, std::memory_order_relaxed);
                try {
                    packet_callback_(raw_packet, parsed_packet);
                    packets_analyzed_.fetch_add(1, std::memory_order_relaxed);
                } catch (...) {
                    analysis_errors_.fetch_add(1, std::memory_order_relaxed);
                    analysis_gap_count_.fetch_add(1, std::memory_order_relaxed);
                    analysis_rejects_.fetch_add(1, std::memory_order_relaxed);
                }
                parser_.recycle(std::move(parsed_packet));
            } catch (...) {
                analysis_errors_.fetch_add(1, std::memory_order_relaxed);
                analysis_gap_count_.fetch_add(1, std::memory_order_relaxed);
                analysis_rejects_.fetch_add(1, std::memory_order_relaxed);
            }
            complete_backlog_bytes();
        }
    } catch (const std::exception& error) {
        analysis_errors_.fetch_add(1, std::memory_order_relaxed);
        emit_error(make_sniffer_error(
            SnifferErrorCode::AnalysisFailed, SnifferSeverity::Error,
            std::string("Analyzer stopped after an exception: ") + error.what(),
            {}, 0, {}, true));
    } catch (...) {
        analysis_errors_.fetch_add(1, std::memory_order_relaxed);
        emit_error(make_sniffer_error(SnifferErrorCode::AnalysisFailed,
                                      SnifferSeverity::Error,
                                      "Analyzer stopped after an unknown exception.",
                                      {}, 0, {}, true));
    }
    analyzer_running_.store(false, std::memory_order_release);
    if (writer_done_.load(std::memory_order_acquire))
        running_.store(false, std::memory_order_release);
}

void SnifferRuntime::handle_packet(
    InterfaceCaptureContext& context,
    const pcap_pkthdr& header,
    const unsigned char* bytes) noexcept {
    context.stats.increment_packets_observed();

    PacketMetadata metadata;
    metadata.key.capture_id = active_capture_id_;
    metadata.key.packet_id = next_packet_id_.fetch_add(1, std::memory_order_relaxed);

    if (bytes == nullptr && header.caplen > 0) {
        context.stats.increment_invalid_callback_drops();
        emit_error(make_sniffer_error(
            SnifferErrorCode::InvalidCallbackPayload,
            SnifferSeverity::Warning,
            "pcap callback produced a null packet payload.",
            context.source->source_name(),
            0,
            {},
            true,
            context.options.id));
        return;
    }

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

    const auto pushed = context.ring->try_push(metadata, payload);
    if (pushed == PacketRingPushResult::Oversize) {
        context.stats.increment_capture_queue_oversize_drops();
        if (!context.oversize_reported.exchange(true, std::memory_order_acq_rel)) {
            emit_error(make_sniffer_error(
                SnifferErrorCode::PacketOversize, SnifferSeverity::Warning,
                "A packet exceeded the configured capture queue byte capacity.",
                context.source->source_name(), 0, {}, true, context.options.id));
        }
        return;
    }
    if (pushed != PacketRingPushResult::Accepted) {
        context.stats.increment_capture_queue_full_drops();
        if (!context.ring_full_reported.exchange(true, std::memory_order_acq_rel)) {
            emit_error(make_sniffer_error(
                SnifferErrorCode::RingFull,
                SnifferSeverity::Warning,
                pushed == PacketRingPushResult::PacketCapacityReached
                    ? "The per-interface capture queue reached its packet capacity; newest packets are being dropped."
                    : "The per-interface capture queue reached its byte capacity; newest packets are being dropped.",
                context.source->source_name(),
                0,
                {},
                true,
                context.options.id));
        }
        return;
    }

    context.stats.increment_capture_queue_accepted();
    context.stats.observe_capture_queue(context.ring->depth(), context.ring->bytes());
    notify_writer();
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
    update_kernel_stats(context);
}

void SnifferRuntime::update_kernel_stats(InterfaceCaptureContext& context) noexcept {
    auto result = context.source->read_stats();
    if (std::holds_alternative<PcapKernelStats>(result)) {
        const auto kernel_stats = std::get<PcapKernelStats>(result);
        context.stats.set_kernel_stats(kernel_stats.recv, kernel_stats.drop, kernel_stats.ifdrop);
    } else {
        context.stats.increment_pcap_stats_read_failures();
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

#include "sniffing/pcap_handle.hpp"

#include <utility>

namespace pruftnet::sniffing::internal {

PcapHandle::PcapHandle(pcap_t* handle, TimestampPrecision timestamp_precision, int link_type, int snapshot_length)
    : handle_(handle), timestamp_precision_(timestamp_precision), link_type_(link_type), snapshot_length_(snapshot_length) {}

PcapHandle::~PcapHandle() { reset(); }

PcapHandle::PcapHandle(PcapHandle&& other) noexcept
    : handle_(other.handle_),
      timestamp_precision_(other.timestamp_precision_),
      link_type_(other.link_type_),
      snapshot_length_(other.snapshot_length_) {
    other.handle_ = nullptr;
    other.link_type_ = 0;
    other.snapshot_length_ = 0;
}

PcapHandle& PcapHandle::operator=(PcapHandle&& other) noexcept {
    if (this == &other) {
        return *this;
    }

    reset();

    handle_ = other.handle_;
    timestamp_precision_ = other.timestamp_precision_;
    link_type_ = other.link_type_;
    snapshot_length_ = other.snapshot_length_;

    other.handle_ = nullptr;
    other.link_type_ = 0;
    other.snapshot_length_ = 0;
    return *this;
}

void PcapHandle::reset() noexcept {
    if (handle_ != nullptr) {
        pcap_close(handle_);
        handle_ = nullptr;
    }
    timestamp_precision_ = TimestampPrecision::Microseconds;
    link_type_ = 0;
    snapshot_length_ = 0;
}

void PcapHandle::reset(pcap_t* handle, TimestampPrecision timestamp_precision, int link_type, int snapshot_length) noexcept {
    reset();
    handle_ = handle;
    timestamp_precision_ = timestamp_precision;
    link_type_ = link_type;
    snapshot_length_ = snapshot_length;
}

bool PcapHandle::valid() const noexcept { return handle_ != nullptr; }

pcap_t* PcapHandle::raw() const noexcept { return handle_; }

int PcapHandle::link_type() const noexcept { return link_type_; }

int PcapHandle::snapshot_length() const noexcept { return snapshot_length_; }

TimestampPrecision PcapHandle::timestamp_precision() const noexcept { return timestamp_precision_; }

std::string PcapHandle::last_error() const {
    if (handle_ == nullptr) {
        return "pcap handle is not open";
    }

    if (const auto* error = pcap_geterr(handle_); error != nullptr) {
        return error;
    }

    return {};
}

int PcapHandle::dispatch(int packet_count, pcap_handler callback, unsigned char* user_data) noexcept {
    if (handle_ == nullptr) {
        return PCAP_ERROR;
    }

    return pcap_dispatch(handle_, packet_count, callback, user_data);
}

void PcapHandle::break_loop() noexcept {
    if (handle_ != nullptr) {
        pcap_breakloop(handle_);
    }
}

std::variant<PcapKernelStats, SnifferError> PcapHandle::read_stats(const std::string& source_name) const {
    if (handle_ == nullptr) {
        return make_sniffer_error(
            SnifferErrorCode::StatsReadFailed,
            SnifferSeverity::Warning,
            "Cannot read pcap stats because the handle is closed.",
            source_name,
            0,
            {},
            true);
    }

    pcap_stat stats = {};
    if (pcap_stats(handle_, &stats) != 0) {
        return make_sniffer_error(
            SnifferErrorCode::StatsReadFailed,
            SnifferSeverity::Warning,
            "Failed to read pcap stats.",
            source_name,
            0,
            pcap_geterr(handle_),
            true);
    }

    PcapKernelStats snapshot;
    snapshot.recv = static_cast<std::uint64_t>(stats.ps_recv);
    snapshot.drop = static_cast<std::uint64_t>(stats.ps_drop);
    snapshot.ifdrop = static_cast<std::uint64_t>(stats.ps_ifdrop);
    return snapshot;
}

std::string pcap_status_to_string(int status) {
#if defined(PRUFTNET_HAVE_PCAP_STATUSTOSTR)
    if (const auto* value = pcap_statustostr(status); value != nullptr) {
        return value;
    }
#endif

    return "pcap status " + std::to_string(status);
}

} // namespace pruftnet::sniffing::internal

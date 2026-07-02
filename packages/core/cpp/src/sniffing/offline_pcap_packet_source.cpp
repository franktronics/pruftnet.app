#include "sniffing/offline_pcap_packet_source.hpp"

#include <memory>
#include <utility>

namespace pruftnet::sniffing::internal {
namespace {

int resolved_snapshot_length(pcap_t* handle) noexcept {
    const auto snapshot = pcap_snapshot(handle);
    return snapshot > 0 ? snapshot : 1;
}

} // namespace

OfflinePcapPacketSource::OfflinePcapPacketSource(std::string file_path, SnifferOptions options)
    : file_path_(std::move(file_path)), options_(std::move(options)) {}

PacketSourceOpenResult OfflinePcapPacketSource::open() {
    close();

    char errbuf[PCAP_ERRBUF_SIZE] = {};
    pcap_t* raw_handle = pcap_open_offline(file_path_.c_str(), errbuf);
    if (raw_handle == nullptr) {
        return make_sniffer_error(
            SnifferErrorCode::PcapOpenFailed,
            SnifferSeverity::Error,
            "Failed to open offline pcap file.",
            file_path_,
            0,
            errbuf);
    }

    std::unique_ptr<pcap_t, decltype(&pcap_close)> handle(raw_handle, pcap_close);

    if (!options_.bpf_filter.empty()) {
        bpf_program program = {};
        if (pcap_compile(handle.get(), &program, options_.bpf_filter.c_str(), 1, PCAP_NETMASK_UNKNOWN) != 0) {
            return make_sniffer_error(
                SnifferErrorCode::FilterCompileFailed,
                SnifferSeverity::Error,
                "Failed to compile BPF filter.",
                file_path_,
                0,
                pcap_geterr(handle.get()));
        }

        if (pcap_setfilter(handle.get(), &program) != 0) {
            const auto error = make_sniffer_error(
                SnifferErrorCode::FilterApplyFailed,
                SnifferSeverity::Error,
                "Failed to apply BPF filter.",
                file_path_,
                0,
                pcap_geterr(handle.get()));
            pcap_freecode(&program);
            return error;
        }

        pcap_freecode(&program);
    }

    const auto link_type = pcap_datalink(handle.get());
    const auto snapshot_length = resolved_snapshot_length(handle.get());
    handle_.reset(handle.release(), TimestampPrecision::Microseconds, link_type, snapshot_length);

    return PacketSourceOpenSuccess{};
}

void OfflinePcapPacketSource::close() noexcept { handle_.reset(); }

void OfflinePcapPacketSource::interrupt() noexcept { handle_.break_loop(); }

PacketSourceDispatchResult OfflinePcapPacketSource::dispatch(
    int max_packets,
    PacketSourceCallback callback,
    void* user_data) noexcept {
    PacketSourceDispatchContext context{callback, user_data};
    const auto result = handle_.dispatch(
        max_packets,
        &packet_source_pcap_trampoline,
        reinterpret_cast<unsigned char*>(&context));

    if (result > 0) {
        return {PacketSourceDispatchStatus::PacketsRead, result, result, {}};
    }

    if (result == 0) {
        return {PacketSourceDispatchStatus::EndOfInput, 0, result, {}};
    }

    if (result == PCAP_ERROR_BREAK) {
        return {PacketSourceDispatchStatus::Interrupted, 0, result, {}};
    }

    return {PacketSourceDispatchStatus::Error, 0, result, handle_.last_error()};
}

int OfflinePcapPacketSource::link_type() const noexcept { return handle_.link_type(); }

int OfflinePcapPacketSource::snapshot_length() const noexcept { return handle_.snapshot_length(); }

TimestampPrecision OfflinePcapPacketSource::timestamp_precision() const noexcept {
    return handle_.timestamp_precision();
}

std::variant<PcapKernelStats, SnifferError> OfflinePcapPacketSource::read_stats() const {
    return PcapKernelStats{};
}

std::string OfflinePcapPacketSource::source_name() const { return file_path_; }

} // namespace pruftnet::sniffing::internal

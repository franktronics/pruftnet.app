#include "sniffing/pcap_session.hpp"

#include <memory>
#include <optional>
#include <utility>

namespace pruftnet::sniffing::internal {
namespace {

SnifferError pcap_configuration_error(const SnifferOptions &options,
                                      SnifferErrorCode code,
                                      std::string operation, int status,
                                      pcap_t *handle = nullptr) {
  std::string pcap_error = pcap_status_to_string(status);
  if (handle != nullptr) {
    if (const auto *last_error = pcap_geterr(handle);
        last_error != nullptr && last_error[0] != '\0') {
      pcap_error = last_error;
    }
  }

  return make_sniffer_error(code, SnifferSeverity::Error,
                            std::move(operation) + " failed: " + pcap_error,
                            options.interface_name, status, pcap_error);
}

SnifferErrorCode activation_error_code(int status) {
#ifdef PCAP_ERROR_PERM_DENIED
  if (status == PCAP_ERROR_PERM_DENIED) {
    return SnifferErrorCode::PermissionDenied;
  }
#endif
#ifdef PCAP_ERROR_NO_SUCH_DEVICE
  if (status == PCAP_ERROR_NO_SUCH_DEVICE) {
    return SnifferErrorCode::DeviceNotFound;
  }
#endif
  return SnifferErrorCode::PcapActivateFailed;
}

} // namespace

PcapSession::PcapSession(pcap_t *handle, TimestampPrecision timestamp_precision,
                         int link_type)
    : handle_(handle), timestamp_precision_(timestamp_precision),
      link_type_(link_type) {}

PcapSession::~PcapSession() {
  if (handle_ != nullptr) {
    pcap_close(handle_);
  }
}

PcapSession::PcapSession(PcapSession &&other) noexcept
    : handle_(other.handle_), timestamp_precision_(other.timestamp_precision_),
      link_type_(other.link_type_) {
  other.handle_ = nullptr;
}

PcapSession &PcapSession::operator=(PcapSession &&other) noexcept {
  if (this == &other) {
    return *this;
  }

  if (handle_ != nullptr) {
    pcap_close(handle_);
  }

  handle_ = other.handle_;
  timestamp_precision_ = other.timestamp_precision_;
  link_type_ = other.link_type_;
  other.handle_ = nullptr;
  return *this;
}

bool PcapSession::valid() const noexcept { return handle_ != nullptr; }

int PcapSession::link_type() const noexcept { return link_type_; }

TimestampPrecision PcapSession::timestamp_precision() const noexcept {
  return timestamp_precision_;
}

std::string PcapSession::last_error() const {
  if (handle_ == nullptr) {
    return "pcap session is not open";
  }

  if (const auto *error = pcap_geterr(handle_); error != nullptr) {
    return error;
  }

  return {};
}

int PcapSession::dispatch(int packet_count, pcap_handler callback,
                          unsigned char *user_data) noexcept {
  if (handle_ == nullptr) {
    return PCAP_ERROR;
  }

  return pcap_dispatch(handle_, packet_count, callback, user_data);
}

void PcapSession::break_loop() noexcept {
  if (handle_ != nullptr) {
    pcap_breakloop(handle_);
  }
}

std::variant<PcapKernelStats, SnifferError>
PcapSession::read_stats(const std::string &interface_name) const {
  if (handle_ == nullptr) {
    return make_sniffer_error(
        SnifferErrorCode::StatsReadFailed, SnifferSeverity::Warning,
        "Cannot read pcap stats because the session is closed.", interface_name,
        0, {}, true);
  }

  pcap_stat stats = {};
  if (pcap_stats(handle_, &stats) != 0) {
    return make_sniffer_error(SnifferErrorCode::StatsReadFailed,
                              SnifferSeverity::Warning,
                              "Failed to read pcap stats.", interface_name, 0,
                              pcap_geterr(handle_), true);
  }

  PcapKernelStats snapshot;
  snapshot.recv = static_cast<std::uint64_t>(stats.ps_recv);
  snapshot.drop = static_cast<std::uint64_t>(stats.ps_drop);
  snapshot.ifdrop = static_cast<std::uint64_t>(stats.ps_ifdrop);
  return snapshot;
}

PcapOpenResult open_pcap_session(const SnifferOptions &options) {
  char errbuf[PCAP_ERRBUF_SIZE] = {};
  pcap_t *raw_handle = pcap_create(options.interface_name.c_str(), errbuf);

  if (raw_handle == nullptr) {
    return make_sniffer_error(
        SnifferErrorCode::PcapCreateFailed, SnifferSeverity::Error,
        "Failed to create pcap session.", options.interface_name, 0, errbuf);
  }

  std::unique_ptr<pcap_t, decltype(&pcap_close)> handle(raw_handle, pcap_close);
  std::vector<SnifferEvent> warnings;

  if (errbuf[0] != '\0') {
    warnings.push_back(SnifferEvent::from_error(make_sniffer_error(
        SnifferErrorCode::PcapCreateFailed, SnifferSeverity::Warning,
        "pcap_create returned a warning.", options.interface_name, 0, errbuf,
        true)));
  }

  auto apply = [&](int status, SnifferErrorCode code,
                   const char *operation) -> std::optional<SnifferError> {
    if (status == 0) {
      return std::nullopt;
    }

    return pcap_configuration_error(options, code, operation, status,
                                    handle.get());
  };

  if (auto error =
          apply(pcap_set_snaplen(handle.get(), options.snaplen),
                SnifferErrorCode::PcapConfigureFailed, "pcap_set_snaplen")) {
    return *error;
  }

  if (auto error =
          apply(pcap_set_promisc(handle.get(), options.promiscuous ? 1 : 0),
                SnifferErrorCode::PcapConfigureFailed, "pcap_set_promisc")) {
    return *error;
  }

  if (auto error = apply(
          pcap_set_buffer_size(handle.get(), options.pcap_buffer_size_bytes),
          SnifferErrorCode::PcapConfigureFailed, "pcap_set_buffer_size")) {
    return *error;
  }

  if (auto error =
          apply(pcap_set_timeout(handle.get(), options.read_timeout_ms),
                SnifferErrorCode::PcapConfigureFailed, "pcap_set_timeout")) {
    return *error;
  }

  TimestampPrecision timestamp_precision = TimestampPrecision::Microseconds;
#if defined(PRUFTNET_HAVE_PCAP_SET_TSTAMP_PRECISION)
  const auto nano_status =
      pcap_set_tstamp_precision(handle.get(), PCAP_TSTAMP_PRECISION_NANO);
  if (nano_status == 0) {
    timestamp_precision = TimestampPrecision::Nanoseconds;
  } else {
    warnings.push_back(SnifferEvent::from_error(make_sniffer_error(
        SnifferErrorCode::PcapConfigureFailed, SnifferSeverity::Warning,
        "Nanosecond timestamps are not supported; falling back to microsecond "
        "timestamps.",
        options.interface_name, nano_status, pcap_status_to_string(nano_status),
        true)));
  }
#endif

  const auto activate_status = pcap_activate(handle.get());
  if (activate_status < 0) {
    return pcap_configuration_error(
        options, activation_error_code(activate_status), "pcap_activate",
        activate_status, handle.get());
  }

  if (activate_status > 0) {
    warnings.push_back(SnifferEvent::from_error(make_sniffer_error(
        SnifferErrorCode::PcapActivateFailed, SnifferSeverity::Warning,
        "pcap_activate returned a warning.", options.interface_name,
        activate_status, pcap_status_to_string(activate_status), true)));
  }

  if (!options.bpf_filter.empty()) {
    bpf_program program = {};
    if (pcap_compile(handle.get(), &program, options.bpf_filter.c_str(), 1,
                     PCAP_NETMASK_UNKNOWN) != 0) {
      return make_sniffer_error(
          SnifferErrorCode::FilterCompileFailed, SnifferSeverity::Error,
          "Failed to compile BPF filter.", options.interface_name, 0,
          pcap_geterr(handle.get()));
    }

    if (pcap_setfilter(handle.get(), &program) != 0) {
      const auto error = make_sniffer_error(
          SnifferErrorCode::FilterApplyFailed, SnifferSeverity::Error,
          "Failed to apply BPF filter.", options.interface_name, 0,
          pcap_geterr(handle.get()));
      pcap_freecode(&program);
      return error;
    }

    pcap_freecode(&program);
  }

  const auto link_type = pcap_datalink(handle.get());

  PcapOpenSuccess success;
  success.session =
      PcapSession(handle.release(), timestamp_precision, link_type);
  success.warnings = std::move(warnings);
  return success;
}

std::string pcap_status_to_string(int status) {
#if defined(PRUFTNET_HAVE_PCAP_STATUSTOSTR)
  if (const auto *value = pcap_statustostr(status); value != nullptr) {
    return value;
  }
#endif

  return "pcap status " + std::to_string(status);
}

} // namespace pruftnet::sniffing::internal

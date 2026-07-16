#include <array>
#include <cassert>

#include "parsing/core_link_types.hpp"
#include "pruftnet/sniffing/sniffer_error.hpp"
#include "pruftnet/sniffing/sniffer_options.hpp"
#include "sniffing/sniffer_options_validation.hpp"

using pruftnet::sniffing::SnifferErrorCode;
using pruftnet::sniffing::SnifferInterfaceOptions;
using pruftnet::sniffing::SnifferOptions;
using pruftnet::sniffing::internal::SnifferOptionsValidation;
using pruftnet::sniffing::internal::validate_sniffer_options;

namespace {

void default_supported_link_types_are_available() {
  SnifferOptions options;
  const auto definitions = pruftnet::parsing::internal::core_link_types();
  assert(options.accepted_link_types.size() == definitions.size());
  for (std::size_t index = 0; index < definitions.size(); ++index) {
    assert(options.accepted_link_types[index] == definitions[index].value);
  }
}

void live_validation_requires_interface_name() {
  SnifferOptions options;
  options.interfaces.push_back(SnifferInterfaceOptions{});
  const auto error = validate_sniffer_options(
      options, SnifferOptionsValidation{.require_interface_name = true});
  assert(error.has_value());
  assert(error->code == SnifferErrorCode::InvalidOptions);
}

void offline_validation_allows_missing_interface_name() {
  SnifferOptions options;
  options.interfaces.push_back(SnifferInterfaceOptions{});
  const auto error = validate_sniffer_options(
      options, SnifferOptionsValidation{.require_interface_name = false});
  assert(!error.has_value());
}

void invalid_numeric_options_are_rejected() {
  {
    SnifferOptions options;
    options.interfaces.push_back(SnifferInterfaceOptions{});
    options.interfaces[0].snaplen = 0;
    const auto error = validate_sniffer_options(
        options, SnifferOptionsValidation{.require_interface_name = false});
    assert(error.has_value());
    assert(error->code == SnifferErrorCode::InvalidOptions);
  }

  {
    SnifferOptions options;
    options.interfaces.push_back(SnifferInterfaceOptions{});
    options.interfaces[0].pcap_buffer_size_bytes = 0;
    const auto error = validate_sniffer_options(
        options, SnifferOptionsValidation{.require_interface_name = false});
    assert(error.has_value());
    assert(error->code == SnifferErrorCode::InvalidOptions);
  }

  {
    SnifferOptions options;
    options.interfaces.push_back(SnifferInterfaceOptions{});
    options.interfaces[0].read_timeout_ms = -1;
    const auto error = validate_sniffer_options(
        options, SnifferOptionsValidation{.require_interface_name = false});
    assert(error.has_value());
    assert(error->code == SnifferErrorCode::InvalidOptions);
  }

  {
    SnifferOptions options;
    options.interfaces.push_back(SnifferInterfaceOptions{});
    options.interfaces[0].pcap_dispatch_batch_size = 0;
    const auto error = validate_sniffer_options(
        options, SnifferOptionsValidation{.require_interface_name = false});
    assert(error.has_value());
    assert(error->code == SnifferErrorCode::InvalidOptions);
  }

  {
    SnifferOptions options;
    options.interfaces.push_back(SnifferInterfaceOptions{});
    options.interfaces[0].ring_slots = 0;
    const auto error = validate_sniffer_options(
        options, SnifferOptionsValidation{.require_interface_name = false});
    assert(error.has_value());
    assert(error->code == SnifferErrorCode::InvalidOptions);
  }
}

void accepted_link_types_must_not_be_empty() {
  SnifferOptions options;
  options.interfaces.push_back(SnifferInterfaceOptions{});
  options.accepted_link_types.clear();
  const auto error = validate_sniffer_options(
      options, SnifferOptionsValidation{.require_interface_name = false});
  assert(error.has_value());
  assert(error->code == SnifferErrorCode::InvalidOptions);
}

void duplicate_interface_ids_are_rejected() {
  SnifferOptions options;
  options.interfaces.push_back(SnifferInterfaceOptions{.id = 7});
  options.interfaces.push_back(SnifferInterfaceOptions{.id = 7});
  const auto error = validate_sniffer_options(
      options, SnifferOptionsValidation{.require_interface_name = false});
  assert(error.has_value());
  assert(error->code == SnifferErrorCode::InvalidOptions);
}

void duplicate_interface_names_are_rejected() {
  SnifferOptions options;
  options.interfaces.push_back(SnifferInterfaceOptions{.name = "en0"});
  options.interfaces.push_back(SnifferInterfaceOptions{.name = "en0"});
  const auto error = validate_sniffer_options(options);
  assert(error.has_value());
  assert(error->code == SnifferErrorCode::InvalidOptions);
}

void strict_upper_bounds_are_rejected() {
  const std::array<void (*)(SnifferInterfaceOptions &), 5> invalidators = {
      [](SnifferInterfaceOptions &value) {
        value.snaplen = pruftnet::sniffing::kMaxSnapshotLength + 1;
      },
      [](SnifferInterfaceOptions &value) {
        value.pcap_buffer_size_bytes =
            pruftnet::sniffing::kMaxPcapBufferSizeBytes + 1;
      },
      [](SnifferInterfaceOptions &value) {
        value.read_timeout_ms = pruftnet::sniffing::kMaxReadTimeoutMs + 1;
      },
      [](SnifferInterfaceOptions &value) {
        value.pcap_dispatch_batch_size =
            pruftnet::sniffing::kMaxPcapDispatchBatchSize + 1;
      },
      [](SnifferInterfaceOptions &value) {
        value.ring_slots = pruftnet::sniffing::kMaxRingSlots + 1;
      },
  };
  for (const auto invalidate : invalidators) {
    SnifferOptions options;
    options.interfaces.push_back(SnifferInterfaceOptions{});
    invalidate(options.interfaces[0]);
    const auto error = validate_sniffer_options(
        options, SnifferOptionsValidation{.require_interface_name = false});
    assert(error.has_value());
    assert(error->code == SnifferErrorCode::InvalidOptions);
  }

  SnifferOptions too_many;
  too_many.interfaces.resize(pruftnet::sniffing::kMaxCaptureInterfaces + 1);
  const auto error = validate_sniffer_options(
      too_many, SnifferOptionsValidation{.require_interface_name = false});
  assert(error.has_value());
  assert(error->code == SnifferErrorCode::InvalidOptions);
}

void configured_ring_budget_is_rejected_during_validation() {
  SnifferOptions options;
  options.interfaces.push_back(SnifferInterfaceOptions{});
  options.max_total_ring_bytes = 1;
  const auto error = validate_sniffer_options(
      options, SnifferOptionsValidation{.require_interface_name = false});
  assert(error.has_value());
  assert(error->code == SnifferErrorCode::MemoryBudgetExceeded);
}

} // namespace

int main() {
  default_supported_link_types_are_available();
  live_validation_requires_interface_name();
  offline_validation_allows_missing_interface_name();
  invalid_numeric_options_are_rejected();
  accepted_link_types_must_not_be_empty();
  duplicate_interface_ids_are_rejected();
  duplicate_interface_names_are_rejected();
  strict_upper_bounds_are_rejected();
  configured_ring_budget_is_rejected_during_validation();
  return 0;
}

#include <cassert>

#include "pruftnet/sniffing/sniffer_error.hpp"
#include "pruftnet/sniffing/sniffer_options.hpp"
#include "sniffing/sniffer_options_validation.hpp"

using pruftnet::sniffing::SnifferErrorCode;
using pruftnet::sniffing::SnifferOptions;
using pruftnet::sniffing::internal::SnifferOptionsValidation;
using pruftnet::sniffing::internal::validate_sniffer_options;

namespace {

void default_supported_link_types_are_available() {
    SnifferOptions options;
    assert(!options.accepted_link_types.empty());
}

void live_validation_requires_interface_name() {
    SnifferOptions options;
    const auto error = validate_sniffer_options(options, SnifferOptionsValidation{.require_interface_name = true});
    assert(error.has_value());
    assert(error->code == SnifferErrorCode::InvalidOptions);
}

void offline_validation_allows_missing_interface_name() {
    SnifferOptions options;
    const auto error = validate_sniffer_options(options, SnifferOptionsValidation{.require_interface_name = false});
    assert(!error.has_value());
}

void invalid_numeric_options_are_rejected() {
    {
        SnifferOptions options;
        options.snaplen = 0;
        const auto error = validate_sniffer_options(options, SnifferOptionsValidation{.require_interface_name = false});
        assert(error.has_value());
        assert(error->code == SnifferErrorCode::InvalidOptions);
    }

    {
        SnifferOptions options;
        options.pcap_buffer_size_bytes = 0;
        const auto error = validate_sniffer_options(options, SnifferOptionsValidation{.require_interface_name = false});
        assert(error.has_value());
        assert(error->code == SnifferErrorCode::InvalidOptions);
    }

    {
        SnifferOptions options;
        options.read_timeout_ms = -1;
        const auto error = validate_sniffer_options(options, SnifferOptionsValidation{.require_interface_name = false});
        assert(error.has_value());
        assert(error->code == SnifferErrorCode::InvalidOptions);
    }

    {
        SnifferOptions options;
        options.pcap_dispatch_batch_size = 0;
        const auto error = validate_sniffer_options(options, SnifferOptionsValidation{.require_interface_name = false});
        assert(error.has_value());
        assert(error->code == SnifferErrorCode::InvalidOptions);
    }

    {
        SnifferOptions options;
        options.ring_slots = 0;
        const auto error = validate_sniffer_options(options, SnifferOptionsValidation{.require_interface_name = false});
        assert(error.has_value());
        assert(error->code == SnifferErrorCode::InvalidOptions);
    }
}

void accepted_link_types_must_not_be_empty() {
    SnifferOptions options;
    options.accepted_link_types.clear();
    const auto error = validate_sniffer_options(options, SnifferOptionsValidation{.require_interface_name = false});
    assert(error.has_value());
    assert(error->code == SnifferErrorCode::InvalidOptions);
}

} // namespace

int main() {
    default_supported_link_types_are_available();
    live_validation_requires_interface_name();
    offline_validation_allows_missing_interface_name();
    invalid_numeric_options_are_rejected();
    accepted_link_types_must_not_be_empty();
    return 0;
}

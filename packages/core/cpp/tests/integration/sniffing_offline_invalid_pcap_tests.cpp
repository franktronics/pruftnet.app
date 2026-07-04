#include <cassert>
#include <filesystem>
#include <memory>
#include <utility>

#include "pruftnet/sniffing/sniffer_error.hpp"
#include "pruftnet/sniffing/sniffer_options.hpp"
#include "sniffing/offline_pcap_packet_source.hpp"
#include "sniffing/sniffer_options_validation.hpp"
#include "sniffing/sniffer_runtime.hpp"
#include "tests/test_config.hpp"
#include "tests/support/runtime_test_support.hpp"

namespace {

using pruftnet::sniffing::SnifferErrorCode;
using pruftnet::sniffing::SnifferInterfaceOptions;
using pruftnet::sniffing::SnifferOptions;
using pruftnet::sniffing::internal::OfflinePcapPacketSource;
using pruftnet::sniffing::internal::SnifferOptionsValidation;
using pruftnet::sniffing::internal::SnifferRuntime;

void pcap_open_failure_is_reported(const std::filesystem::path& path) {
    SnifferOptions options;
    SnifferInterfaceOptions interface_options;
    options.interfaces.push_back(interface_options);
    SnifferRuntime runtime(
        options,
        pruftnet::tests::one_source(std::make_unique<OfflinePcapPacketSource>(path.string(), interface_options)),
        SnifferOptionsValidation{.require_interface_name = false},
        [](const auto&, const auto&, const auto&) {},
        {});

    const auto error = runtime.start();
    assert(error.has_value());
    assert(error->code == SnifferErrorCode::PcapOpenFailed);
}

} // namespace

int main() {
    const auto invalid_fixture = pruftnet::tests::fixture_path("invalid.pcap");
    assert(std::filesystem::exists(invalid_fixture));
    pcap_open_failure_is_reported(invalid_fixture);

    const auto missing_fixture = pruftnet::tests::fixture_path("missing-file.pcap");
    assert(!std::filesystem::exists(missing_fixture));
    pcap_open_failure_is_reported(missing_fixture);
    return 0;
}

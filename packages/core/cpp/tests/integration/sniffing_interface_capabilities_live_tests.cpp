#include <cassert>
#include <iostream>
#include <variant>

#include "pruftnet/sniffing/interface_discovery.hpp"
#include "pruftnet/sniffing/sniffer_error.hpp"
#include "tests/test_config.hpp"

int main() {
    using namespace pruftnet::sniffing;

    const auto interface_name = pruftnet::tests::live_interface_name();
    if (!interface_name.has_value()) {
        std::cerr << "Skipping live interface capabilities test because PRUFTNET_TEST_INTERFACE is not set.\n";
        return pruftnet::tests::kSkipExitCode;
    }

    auto result = read_interface_capabilities(*interface_name);
    if (std::holds_alternative<SnifferError>(result)) {
        const auto& error = std::get<SnifferError>(result);
        std::cerr << to_string(error.code) << ": " << error.message << '\n';
        return 1;
    }

    const auto& capabilities = std::get<CaptureInterfaceCapabilities>(result);
    assert(capabilities.name == *interface_name);
    for (const auto& link_type : capabilities.link_types) {
        assert(!link_type.name.empty());
    }
    for (const auto& timestamp_type : capabilities.timestamp_types) {
        assert(!timestamp_type.name.empty());
    }

    return 0;
}

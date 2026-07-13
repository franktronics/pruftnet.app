#include <cassert>
#include <iostream>
#include <string>
#include <variant>
#include <vector>

#include "pruftnet/sniffing/interface_discovery.hpp"
#include "pruftnet/sniffing/sniffer_error.hpp"

int main() {
    using namespace pruftnet::sniffing;

    auto result = list_capture_interfaces();
    if (std::holds_alternative<SnifferError>(result)) {
        const auto& error = std::get<SnifferError>(result);
        std::cerr << to_string(error.code) << ": " << error.message << '\n';
        return 1;
    }

    const auto& interfaces = std::get<std::vector<CaptureInterfaceDescriptor>>(result);
    for (const auto& interface : interfaces) {
        assert(!interface.name.empty());
        for (const auto& address : interface.addresses) {
            assert(!address.address.empty());
            assert(
                address.family == CaptureInterfaceAddressFamily::IPv4 ||
                address.family == CaptureInterfaceAddressFamily::IPv6);
        }
    }

    return 0;
}

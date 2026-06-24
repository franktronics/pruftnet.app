#pragma once

#include <string>
#include <variant>
#include <vector>

#include "pruftnet/capture/capture_error.hpp"

namespace pruftnet::capture {

struct PcapDevice {
    std::string name;
    std::string description;
    bool loopback = false;
    bool up = false;
    bool running = false;
    bool wireless = false;
};

using PcapDeviceListResult = std::variant<std::vector<PcapDevice>, CaptureError>;

PcapDeviceListResult list_pcap_devices();

} // namespace pruftnet::capture

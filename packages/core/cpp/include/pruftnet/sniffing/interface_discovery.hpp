#pragma once

#include <string>
#include <variant>
#include <vector>

#include "pruftnet/sniffing/sniffer_error.hpp"
#include "pruftnet/sniffing/sniffer_event.hpp"

namespace pruftnet::sniffing {

struct CaptureInterfaceDescriptor {
    std::string name;
    std::string description;
    bool is_loopback = false;
    bool is_up = false;
    bool is_running = false;
    bool is_wireless = false;
};

struct CaptureLinkTypeDescriptor {
    int value = 0;
    std::string name;
    std::string description;
    bool is_default = false;
};

struct CaptureTimestampTypeDescriptor {
    int value = 0;
    std::string name;
    std::string description;
};

struct CaptureInterfaceCapabilities {
    std::string name;
    bool can_set_monitor_mode = false;
    std::vector<CaptureLinkTypeDescriptor> link_types;
    std::vector<CaptureTimestampTypeDescriptor> timestamp_types;
    std::vector<SnifferEvent> warnings;
};

[[nodiscard]] std::variant<std::vector<CaptureInterfaceDescriptor>, SnifferError> list_capture_interfaces();

[[nodiscard]] std::variant<CaptureInterfaceCapabilities, SnifferError> read_interface_capabilities(
    const std::string& interface_name,
    bool monitor_mode = false);

} // namespace pruftnet::sniffing

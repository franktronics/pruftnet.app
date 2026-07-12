#include "pruftnet/sniffing/interface_discovery.hpp"

#include <memory>
#include <string>
#include <utility>

#include <pcap/pcap.h>

#include "sniffing/pcap_handle.hpp"

namespace pruftnet::sniffing {
namespace {

bool has_flag(unsigned int flags, unsigned int flag) noexcept { return (flags & flag) != 0; }

std::string datalink_name(int link_type) {
#if defined(PRUFTNET_HAVE_PCAP_DATALINK_NAME)
    if (const auto* name = pcap_datalink_val_to_name(link_type); name != nullptr) {
        return name;
    }
#endif
    return std::to_string(link_type);
}

std::string datalink_description(int link_type) {
#if defined(PRUFTNET_HAVE_PCAP_DATALINK_DESCRIPTION)
    if (const auto* description = pcap_datalink_val_to_description(link_type); description != nullptr) {
        return description;
    }
#endif
    return {};
}

std::string timestamp_type_name(int timestamp_type) {
#if defined(PRUFTNET_HAVE_PCAP_TSTAMP_TYPE_VAL_TO_NAME)
    if (const auto* name = pcap_tstamp_type_val_to_name(timestamp_type); name != nullptr) {
        return name;
    }
#endif
    return std::to_string(timestamp_type);
}

std::string timestamp_type_description(int timestamp_type) {
#if defined(PRUFTNET_HAVE_PCAP_TSTAMP_TYPE_VAL_TO_DESCRIPTION)
    if (const auto* description = pcap_tstamp_type_val_to_description(timestamp_type); description != nullptr) {
        return description;
    }
#endif
    return {};
}

SnifferEvent warning_event(
    SnifferErrorCode code,
    std::string message,
    std::string interface_name,
    int pcap_status = 0,
    std::string pcap_error = {}) {
    return SnifferEvent::from_error(make_sniffer_error(
        code,
        SnifferSeverity::Warning,
        std::move(message),
        std::move(interface_name),
        pcap_status,
        std::move(pcap_error),
        true));
}

} // namespace

std::variant<std::vector<CaptureInterfaceDescriptor>, SnifferError> list_capture_interfaces() {
    char errbuf[PCAP_ERRBUF_SIZE] = {};
    pcap_if_t* raw_devices = nullptr;
    if (pcap_findalldevs(&raw_devices, errbuf) != 0) {
        return make_sniffer_error(
            SnifferErrorCode::DeviceNotFound,
            SnifferSeverity::Error,
            "Failed to list pcap capture interfaces.",
            {},
            0,
            errbuf);
    }

    std::unique_ptr<pcap_if_t, decltype(&pcap_freealldevs)> devices(raw_devices, pcap_freealldevs);
    std::vector<CaptureInterfaceDescriptor> interfaces;
    for (auto* device = devices.get(); device != nullptr; device = device->next) {
        CaptureInterfaceDescriptor descriptor;
        descriptor.name = device->name != nullptr ? device->name : "";
        descriptor.description = device->description != nullptr ? device->description : "";
#ifdef PCAP_IF_LOOPBACK
        descriptor.is_loopback = has_flag(device->flags, PCAP_IF_LOOPBACK);
#endif
#ifdef PCAP_IF_UP
        descriptor.is_up = has_flag(device->flags, PCAP_IF_UP);
#endif
#ifdef PCAP_IF_RUNNING
        descriptor.is_running = has_flag(device->flags, PCAP_IF_RUNNING);
#endif
#ifdef PCAP_IF_WIRELESS
        descriptor.is_wireless = has_flag(device->flags, PCAP_IF_WIRELESS);
#endif
        interfaces.push_back(std::move(descriptor));
    }

    return interfaces;
}

std::variant<CaptureInterfaceCapabilities, SnifferError> read_interface_capabilities(
    const std::string& interface_name,
    bool monitor_mode) {
    char errbuf[PCAP_ERRBUF_SIZE] = {};
    pcap_t* raw_handle = pcap_create(interface_name.c_str(), errbuf);
    if (raw_handle == nullptr) {
        return make_sniffer_error(
            SnifferErrorCode::PcapCreateFailed,
            SnifferSeverity::Error,
            "Failed to create pcap session for interface capability discovery.",
            interface_name,
            0,
            errbuf);
    }

    std::unique_ptr<pcap_t, decltype(&pcap_close)> handle(raw_handle, pcap_close);
    CaptureInterfaceCapabilities capabilities;
    capabilities.name = interface_name;

    if (errbuf[0] != '\0') {
        capabilities.warnings.push_back(warning_event(
            SnifferErrorCode::PcapCreateFailed,
            "pcap_create returned a warning during capability discovery.",
            interface_name,
            0,
            errbuf));
    }

#if defined(PRUFTNET_HAVE_PCAP_CAN_SET_RFMON)
    const auto rfmon_status = pcap_can_set_rfmon(handle.get());
    if (rfmon_status >= 0) {
        capabilities.can_set_monitor_mode = rfmon_status != 0;
    } else {
        capabilities.warnings.push_back(warning_event(
            SnifferErrorCode::PcapConfigureFailed,
            "Failed to query pcap monitor mode capability.",
            interface_name,
            rfmon_status,
            pcap_geterr(handle.get())));
    }
#endif

    if (monitor_mode) {
#if defined(PRUFTNET_HAVE_PCAP_SET_RFMON)
        const auto rfmon_set_status = pcap_set_rfmon(handle.get(), 1);
        if (rfmon_set_status != 0) {
            return make_sniffer_error(
                SnifferErrorCode::PcapConfigureFailed,
                SnifferSeverity::Error,
                "Failed to enable monitor mode during capability discovery.",
                interface_name,
                rfmon_set_status,
                pcap_geterr(handle.get()));
        }
#else
        return make_sniffer_error(
            SnifferErrorCode::PcapConfigureFailed,
            SnifferSeverity::Error,
            "This libpcap build does not support monitor mode.",
            interface_name);
#endif
    }

    const auto activate_status = pcap_activate(handle.get());
    if (activate_status < 0) {
        return make_sniffer_error(
            SnifferErrorCode::PcapActivateFailed,
            SnifferSeverity::Error,
            "Failed to activate pcap session for interface capability discovery.",
            interface_name,
            activate_status,
            pcap_geterr(handle.get()));
    }
    if (activate_status > 0) {
        capabilities.warnings.push_back(warning_event(
            SnifferErrorCode::PcapActivateFailed,
            "pcap_activate returned a warning during capability discovery.",
            interface_name,
            activate_status,
            internal::pcap_status_to_string(activate_status)));
    }

    const auto default_link_type = pcap_datalink(handle.get());

#if defined(PRUFTNET_HAVE_PCAP_LIST_DATALINKS) && defined(PRUFTNET_HAVE_PCAP_FREE_DATALINKS)
    int* link_types = nullptr;
    const auto link_type_count = pcap_list_datalinks(handle.get(), &link_types);
    if (link_type_count >= 0) {
        std::unique_ptr<int, decltype(&pcap_free_datalinks)> links(link_types, pcap_free_datalinks);
        capabilities.link_types.reserve(static_cast<std::size_t>(link_type_count));
        for (int index = 0; index < link_type_count; ++index) {
            CaptureLinkTypeDescriptor descriptor;
            descriptor.value = link_types[index];
            descriptor.name = datalink_name(descriptor.value);
            descriptor.description = datalink_description(descriptor.value);
            descriptor.is_default = descriptor.value == default_link_type;
            capabilities.link_types.push_back(std::move(descriptor));
        }
    } else {
        capabilities.warnings.push_back(warning_event(
            SnifferErrorCode::PcapConfigureFailed,
            "Failed to query pcap data link types.",
            interface_name,
            link_type_count,
            pcap_geterr(handle.get())));
    }
#else
    capabilities.warnings.push_back(warning_event(
        SnifferErrorCode::PcapConfigureFailed,
        "This libpcap build does not expose pcap data link type discovery.",
        interface_name));
#endif

#if defined(PRUFTNET_HAVE_PCAP_LIST_TSTAMP_TYPES) && defined(PRUFTNET_HAVE_PCAP_FREE_TSTAMP_TYPES)
    int* timestamp_types = nullptr;
    const auto timestamp_type_count = pcap_list_tstamp_types(handle.get(), &timestamp_types);
    if (timestamp_type_count >= 0) {
        std::unique_ptr<int, decltype(&pcap_free_tstamp_types)> timestamps(
            timestamp_types,
            pcap_free_tstamp_types);
        capabilities.timestamp_types.reserve(static_cast<std::size_t>(timestamp_type_count));
        for (int index = 0; index < timestamp_type_count; ++index) {
            CaptureTimestampTypeDescriptor descriptor;
            descriptor.value = timestamp_types[index];
            descriptor.name = timestamp_type_name(descriptor.value);
            descriptor.description = timestamp_type_description(descriptor.value);
            capabilities.timestamp_types.push_back(std::move(descriptor));
        }
    } else {
        capabilities.warnings.push_back(warning_event(
            SnifferErrorCode::PcapConfigureFailed,
            "Failed to query pcap timestamp types.",
            interface_name,
            timestamp_type_count,
            pcap_geterr(handle.get())));
    }
#endif

    return capabilities;
}

} // namespace pruftnet::sniffing

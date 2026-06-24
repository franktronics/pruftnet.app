#include "pruftnet/capture/pcap_device.hpp"

#include <pcap/pcap.h>

namespace pruftnet::capture {
namespace {

bool has_flag(unsigned int flags, unsigned int flag) {
    return (flags & flag) != 0;
}

} // namespace

PcapDeviceListResult list_pcap_devices() {
    char errbuf[PCAP_ERRBUF_SIZE] = {};
    pcap_if_t* devices = nullptr;

    if (pcap_findalldevs(&devices, errbuf) != 0) {
        return make_capture_error(
            CaptureErrorCode::PcapCreateFailed,
            CaptureSeverity::Error,
            "Failed to list pcap devices.",
            {},
            0,
            errbuf);
    }

    std::vector<PcapDevice> result;

    for (auto* device = devices; device != nullptr; device = device->next) {
        PcapDevice item;
        item.name = device->name != nullptr ? device->name : "";
        item.description = device->description != nullptr ? device->description : "";

#ifdef PCAP_IF_LOOPBACK
        item.loopback = has_flag(device->flags, PCAP_IF_LOOPBACK);
#endif
#ifdef PCAP_IF_UP
        item.up = has_flag(device->flags, PCAP_IF_UP);
#endif
#ifdef PCAP_IF_RUNNING
        item.running = has_flag(device->flags, PCAP_IF_RUNNING);
#endif
#ifdef PCAP_IF_WIRELESS
        item.wireless = has_flag(device->flags, PCAP_IF_WIRELESS);
#endif

        result.push_back(std::move(item));
    }

    if (devices != nullptr) {
        pcap_freealldevs(devices);
    }

    return result;
}

} // namespace pruftnet::capture

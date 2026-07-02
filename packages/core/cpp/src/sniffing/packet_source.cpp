#include "sniffing/packet_source.hpp"

namespace pruftnet::sniffing::internal {

void packet_source_pcap_trampoline(
    unsigned char* user_data,
    const pcap_pkthdr* header,
    const unsigned char* bytes) noexcept {
    if (user_data == nullptr || header == nullptr) {
        return;
    }

    auto* context = reinterpret_cast<PacketSourceDispatchContext*>(user_data);
    if (context->callback == nullptr) {
        return;
    }

    context->callback(context->user_data, *header, bytes);
}

} // namespace pruftnet::sniffing::internal

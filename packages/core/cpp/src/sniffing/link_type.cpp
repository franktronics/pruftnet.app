#include "sniffing/link_type.hpp"

#include <algorithm>
#include <pcap/pcap.h>
#include <sstream>

namespace pruftnet::sniffing::internal {

bool is_link_type_accepted(int link_type, const std::vector<int>& accepted_link_types) {
    return std::find(accepted_link_types.begin(), accepted_link_types.end(), link_type) !=
           accepted_link_types.end();
}

std::string link_type_name(int link_type) {
#if defined(PRUFTNET_HAVE_PCAP_DATALINK_NAME)
    if (const auto* name = pcap_datalink_val_to_name(link_type); name != nullptr) {
        return std::string("DLT_") + name;
    }
#endif

    switch (link_type) {
#ifdef DLT_EN10MB
    case DLT_EN10MB:
        return "DLT_EN10MB";
#endif
#ifdef DLT_LINUX_SLL
    case DLT_LINUX_SLL:
        return "DLT_LINUX_SLL";
#endif
#ifdef DLT_LINUX_SLL2
    case DLT_LINUX_SLL2:
        return "DLT_LINUX_SLL2";
#endif
#ifdef DLT_RAW
    case DLT_RAW:
        return "DLT_RAW";
#endif
#ifdef DLT_NULL
    case DLT_NULL:
        return "DLT_NULL";
#endif
#ifdef DLT_LOOP
    case DLT_LOOP:
        return "DLT_LOOP";
#endif
    default:
        return "DLT_" + std::to_string(link_type);
    }
}

std::string format_link_type_list(const std::vector<int>& link_types) {
    std::ostringstream stream;
    for (std::size_t index = 0; index < link_types.size(); ++index) {
        if (index > 0) {
            stream << ", ";
        }
        stream << link_type_name(link_types[index]);
    }
    return stream.str();
}

} // namespace pruftnet::sniffing::internal

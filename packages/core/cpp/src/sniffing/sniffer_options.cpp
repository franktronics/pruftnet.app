#include "pruftnet/sniffing/sniffer_options.hpp"

#include <pcap/pcap.h>

namespace pruftnet::sniffing {

std::vector<int> default_supported_link_types() {
    std::vector<int> link_types;

#ifdef DLT_EN10MB
    link_types.push_back(DLT_EN10MB);
#endif
#ifdef DLT_LINUX_SLL
    link_types.push_back(DLT_LINUX_SLL);
#endif
#ifdef DLT_LINUX_SLL2
    link_types.push_back(DLT_LINUX_SLL2);
#endif
#ifdef DLT_RAW
    link_types.push_back(DLT_RAW);
#endif
#ifdef DLT_NULL
    link_types.push_back(DLT_NULL);
#endif
#ifdef DLT_LOOP
    link_types.push_back(DLT_LOOP);
#endif

    return link_types;
}

SnifferOptions::SnifferOptions() : accepted_link_types(default_supported_link_types()) {}

} // namespace pruftnet::sniffing

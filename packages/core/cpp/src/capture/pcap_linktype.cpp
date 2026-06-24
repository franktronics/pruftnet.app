#include "pruftnet/capture/pcap_linktype.hpp"

#include <algorithm>
#include <cctype>
#include <cstdlib>
#include <pcap/pcap.h>
#include <sstream>
#include <string>
#include <utility>

namespace pruftnet::capture {
namespace {

struct LinkTypeEntry {
    const char* name;
    int value;
};

std::vector<LinkTypeEntry> known_link_types() {
    std::vector<LinkTypeEntry> entries;

#ifdef DLT_EN10MB
    entries.push_back({"DLT_EN10MB", DLT_EN10MB});
#endif
#ifdef DLT_LINUX_SLL
    entries.push_back({"DLT_LINUX_SLL", DLT_LINUX_SLL});
#endif
#ifdef DLT_LINUX_SLL2
    entries.push_back({"DLT_LINUX_SLL2", DLT_LINUX_SLL2});
#endif
#ifdef DLT_RAW
    entries.push_back({"DLT_RAW", DLT_RAW});
#endif
#ifdef DLT_NULL
    entries.push_back({"DLT_NULL", DLT_NULL});
#endif
#ifdef DLT_LOOP
    entries.push_back({"DLT_LOOP", DLT_LOOP});
#endif

    return entries;
}

std::string normalize_link_type_name(std::string_view name) {
    std::string normalized(name);
    std::transform(normalized.begin(), normalized.end(), normalized.begin(), [](unsigned char value) {
        return static_cast<char>(std::toupper(value));
    });

    if (!normalized.starts_with("DLT_")) {
        normalized.insert(0, "DLT_");
    }

    return normalized;
}

} // namespace

std::vector<int> default_accepted_link_types() {
    std::vector<int> values;
    for (const auto& entry : known_link_types()) {
        values.push_back(entry.value);
    }

    return values;
}

bool is_link_type_accepted(int link_type, const std::vector<int>& accepted_link_types) {
    return std::find(accepted_link_types.begin(), accepted_link_types.end(), link_type) !=
           accepted_link_types.end();
}

std::string link_type_name(int link_type) {
#if defined(PRUFTNET_HAVE_PCAP_DATALINK_DESCRIPTION)
    if (const auto* name = pcap_datalink_val_to_name(link_type); name != nullptr) {
        return std::string("DLT_") + name;
    }
#endif

    for (const auto& entry : known_link_types()) {
        if (entry.value == link_type) {
            return entry.name;
        }
    }

    return "DLT_" + std::to_string(link_type);
}

std::string link_type_description(int link_type) {
#if defined(PRUFTNET_HAVE_PCAP_DATALINK_DESCRIPTION)
    if (const auto* description = pcap_datalink_val_to_description(link_type);
        description != nullptr) {
        return description;
    }
#endif

    return link_type_name(link_type);
}

std::optional<int> link_type_value_by_name(std::string_view name) {
    if (name.empty()) {
        return std::nullopt;
    }

    char* end = nullptr;
    const auto numeric = std::strtol(std::string(name).c_str(), &end, 10);
    if (end != nullptr && *end == '\0') {
        return static_cast<int>(numeric);
    }

    const auto normalized = normalize_link_type_name(name);
    for (const auto& entry : known_link_types()) {
        if (normalized == entry.name) {
            return entry.value;
        }
    }

    return std::nullopt;
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

} // namespace pruftnet::capture

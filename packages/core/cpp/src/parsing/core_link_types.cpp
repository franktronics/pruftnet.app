#include "parsing/core_link_types.hpp"

#include <algorithm>
#include <pcap/pcap.h>
#include <vector>

namespace pruftnet::parsing::internal {
namespace {

void append_unique(std::vector<CoreLinkTypeDefinition> &definitions, int value,
                   CoreLinkTypeKind kind) {
  const auto duplicate =
      std::ranges::find(definitions, value, &CoreLinkTypeDefinition::value);
  if (duplicate == definitions.end()) {
    definitions.push_back({value, kind});
  }
}

const std::vector<CoreLinkTypeDefinition> &definitions() {
  static const auto values = [] {
    std::vector<CoreLinkTypeDefinition> result;
    result.reserve(6);
#ifdef DLT_EN10MB
    append_unique(result, DLT_EN10MB, CoreLinkTypeKind::Ethernet);
#endif
#ifdef DLT_LINUX_SLL
    append_unique(result, DLT_LINUX_SLL, CoreLinkTypeKind::LinuxCookedV1);
#endif
#ifdef DLT_LINUX_SLL2
    append_unique(result, DLT_LINUX_SLL2, CoreLinkTypeKind::LinuxCookedV2);
#endif
#ifdef DLT_NULL
    append_unique(result, DLT_NULL, CoreLinkTypeKind::Null);
#endif
#ifdef DLT_LOOP
    append_unique(result, DLT_LOOP, CoreLinkTypeKind::Loop);
#endif
#ifdef DLT_RAW
    append_unique(result, DLT_RAW, CoreLinkTypeKind::Raw);
#endif
    return result;
  }();
  return values;
}

} // namespace

std::span<const CoreLinkTypeDefinition> core_link_types() {
  return definitions();
}

} // namespace pruftnet::parsing::internal

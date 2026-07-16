#pragma once

#include <cstddef>
#include <cstdint>

namespace pruftnet::parsing {
class PacketView;
}

namespace pruftnet::parsing::internal {

class DissectorContext;
struct IcmpExtensionDissectorState;

struct IcmpExtensionSummary {
  std::size_t object_count = 0;
  std::size_t interface_identification_objects = 0;
  bool complete = false;
};

IcmpExtensionSummary dissect_icmp_extension(DissectorContext &,
                                            const IcmpExtensionDissectorState &,
                                            const PacketView &, std::uint32_t);

} // namespace pruftnet::parsing::internal

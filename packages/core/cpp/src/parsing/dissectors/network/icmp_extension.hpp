#pragma once

#include <cstddef>
#include <cstdint>

#include "pruftnet/parsing/registry.hpp"

namespace pruftnet::parsing {
class PacketView;
}

namespace pruftnet::parsing::internal {

class DissectorContext;

struct IcmpExtensionDissectorState {
  FieldId structure;
  FieldId version;
  FieldId reserved;
  FieldId checksum;
  FieldId checksum_valid;
  FieldId object;
  FieldId object_length;
  FieldId object_class;
  FieldId object_ctype;
  FieldId object_data;
  FieldId mpls_entry;
  FieldId mpls_label;
  FieldId mpls_traffic_class;
  FieldId mpls_bottom_of_stack;
  FieldId mpls_ttl;
};

struct IcmpExtensionSummary {
  std::size_t object_count = 0;
  std::size_t interface_identification_objects = 0;
  bool complete = false;
};

IcmpExtensionSummary dissect_icmp_extension(DissectorContext &,
                                            const IcmpExtensionDissectorState &,
                                            const PacketView &, std::uint32_t);

} // namespace pruftnet::parsing::internal

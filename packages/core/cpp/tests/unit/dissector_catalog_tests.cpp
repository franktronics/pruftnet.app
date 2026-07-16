#include <cassert>
#include <memory>
#include <stdexcept>
#include <variant>

#include "parsing/core_link_types.hpp"
#include "parsing/dissector_catalog.hpp"
#include "pruftnet/parsing/registry.hpp"

namespace {

using namespace pruftnet::parsing;
using namespace pruftnet::parsing::internal;

RegistrySnapshotPtr core_registry() {
  auto result = make_core_registry();
  assert(std::holds_alternative<RegistrySnapshot>(result));
  return std::make_shared<const RegistrySnapshot>(
      std::move(std::get<RegistrySnapshot>(result)));
}

void core_catalog_has_typed_dispatch_paths() {
  const auto catalog = make_core_dissector_catalog(core_registry());
  assert(catalog->root());
  assert(catalog->ethernet());
  for (const auto &definition : core_link_types()) {
    assert(catalog->dlt(static_cast<std::uint32_t>(definition.value)));
  }
  assert(!catalog->dlt(147));
  assert(catalog->ethertype(0x0800));
  assert(catalog->ethertype(0x8100));
  assert(catalog->ethertype(0x88a8));
  assert(catalog->ethertype(0x0806));
  assert(catalog->ethertype(0x8035));
  assert(catalog->ethertype(0x86dd));
  assert(catalog->ethertype(0x88cc));
  assert(catalog->ethertype(0x8181));
  assert(catalog->ethertype(0x6558));
  assert(catalog->ethertype(0x8847));
  assert(catalog->ethertype(0x8848));
  assert(catalog->ip_protocol(IpFamily::V4, 4));
  assert(catalog->ip_protocol(IpFamily::V6, 4));
  assert(catalog->ip_protocol(IpFamily::V4, 41));
  assert(catalog->ip_protocol(IpFamily::V6, 41));
  assert(catalog->ip_protocol(IpFamily::V4, 47));
  assert(catalog->ip_protocol(IpFamily::V6, 47));
  assert(catalog->ip_protocol(IpFamily::V4, 137));
  assert(catalog->ip_protocol(IpFamily::V6, 137));
  assert(catalog->ip_protocol(IpFamily::V4, 6));
  assert(catalog->ip_protocol(IpFamily::V6, 17));
  assert(catalog->ip_protocol(IpFamily::V4, 1));
  assert(catalog->ip_protocol(IpFamily::V4, 2));
  assert(!catalog->ip_protocol(IpFamily::V6, 1));
  assert(catalog->ip_protocol(IpFamily::V6, 58));
  assert(!catalog->ip_protocol(IpFamily::V4, 58));
  assert(catalog->sll_protocol(1, 0x0003));
  assert(catalog->sll_protocol(1, 0x0004));
  assert(catalog->null_family(2));
  assert(catalog->null_family(30));
  assert(!catalog->null_family(1));
  assert(catalog->llc());
  assert(catalog->snap(true));
  assert(catalog->snap(false));
  assert(catalog->llc_sap(0x42));
  assert(catalog->snap_pid(0x0080c2, 0x000e));
  assert(!catalog->snap_pid(0, 0x0800));
  assert(catalog->udp_port(53));
  assert(catalog->tcp_port(53));
  assert(catalog->udp_port(5353));
  assert(!catalog->tcp_port(5353));
  assert(catalog->udp_port(5355));
  assert(catalog->tcp_port(5355));
  assert(catalog->tcp_port(80));
  assert(catalog->tcp_port(443));
  assert(catalog->udp_port(67));
  assert(catalog->udp_port(68));
  assert(catalog->udp_port(546));
  assert(catalog->udp_port(547));
  assert(catalog->udp_port(123));
  assert(catalog->udp_port(4789));
  assert(catalog->udp_port(4790));
  assert(catalog->udp_port(6081));
  assert(catalog->udp_port(6635));
  assert(catalog->udp_port(8472));
  assert(catalog->udp_port(443));
}

void catalog_rejects_incompatible_registries_before_capture() {
  RegistryBuilder builder;
  const auto protocol = builder.register_protocol("root", "Root");
  assert(std::holds_alternative<ProtocolId>(protocol));
  assert(std::holds_alternative<FieldId>(
      builder.register_field(std::get<ProtocolId>(protocol), "root.frame",
                             "Frame", FieldValueType::Protocol)));
  auto snapshot = builder.freeze();
  assert(std::holds_alternative<RegistrySnapshot>(snapshot));
  bool rejected = false;
  try {
    (void)make_core_dissector_catalog(std::make_shared<const RegistrySnapshot>(
        std::move(std::get<RegistrySnapshot>(snapshot))));
  } catch (const std::logic_error &) {
    rejected = true;
  }
  assert(rejected);
}

} // namespace

int main() {
  core_catalog_has_typed_dispatch_paths();
  catalog_rejects_incompatible_registries_before_capture();
}

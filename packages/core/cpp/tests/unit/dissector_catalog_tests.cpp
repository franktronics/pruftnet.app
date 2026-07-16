#include <algorithm>
#include <array>
#include <cassert>
#include <cstdint>
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

template <typename Value, std::size_t Size>
bool contains(const std::array<Value, Size> &values, Value value) {
  return std::find(values.begin(), values.end(), value) != values.end();
}

void core_catalog_has_typed_dispatch_paths() {
  const auto catalog = make_core_dissector_catalog(core_registry());
  assert(catalog->root());
  assert(catalog->ethernet());
  assert(catalog->llc());
  assert(catalog->snap(true));
  assert(catalog->snap(false));

  for (const auto &definition : core_link_types()) {
    assert(catalog->dlt(static_cast<std::uint32_t>(definition.value)));
  }
  assert(!catalog->dlt(147));

  constexpr std::array<std::uint16_t, 11> ethertypes{
      0x0800, 0x0806, 0x8035, 0x8100, 0x8181, 0x86dd,
      0x8847, 0x8848, 0x88a8, 0x88cc, 0x6558,
  };
  for (std::uint32_t selector = 0; selector <= UINT16_MAX; ++selector) {
    assert(static_cast<bool>(
               catalog->ethertype(static_cast<std::uint16_t>(selector))) ==
           contains(ethertypes, static_cast<std::uint16_t>(selector)));
  }

  constexpr std::array<std::uint8_t, 8> ipv4_protocols{
      1, 2, 4, 6, 17, 41, 47, 137,
  };
  constexpr std::array<std::uint8_t, 7> ipv6_protocols{
      4, 6, 17, 41, 47, 58, 137,
  };
  for (std::uint16_t selector = 0; selector <= UINT8_MAX; ++selector) {
    const auto protocol = static_cast<std::uint8_t>(selector);
    assert(static_cast<bool>(catalog->ip_protocol(IpFamily::V4, protocol)) ==
           contains(ipv4_protocols, protocol));
    assert(static_cast<bool>(catalog->ip_protocol(IpFamily::V6, protocol)) ==
           contains(ipv6_protocols, protocol));
  }

  assert(catalog->sll_protocol(1, 0x0003));
  assert(catalog->sll_protocol(1, 0x0004));
  assert(!catalog->sll_protocol(1, 0x0002));
  assert(!catalog->sll_protocol(1, 0x0005));
  assert(catalog->null_family(2));
  assert(catalog->null_family(24));
  assert(catalog->null_family(28));
  assert(catalog->null_family(30));
  assert(!catalog->null_family(1));
  assert(!catalog->null_family(31));

  for (std::uint16_t selector = 0; selector <= UINT8_MAX; ++selector) {
    assert(static_cast<bool>(catalog->llc_sap(
               static_cast<std::uint8_t>(selector))) == (selector == 0x42));
  }
  assert(catalog->snap_pid(0x0080c2, 0x000e));
  assert(!catalog->snap_pid(0, 0x0800));

  constexpr std::array<std::uint16_t, 14> udp_ports{
      53, 67, 68, 123, 443, 546, 547, 4789, 4790, 5353, 5355, 6081, 6635, 8472,
  };
  constexpr std::array<std::uint16_t, 4> tcp_ports{
      53,
      80,
      443,
      5355,
  };
  for (std::uint32_t selector = 0; selector <= UINT16_MAX; ++selector) {
    const auto port = static_cast<std::uint16_t>(selector);
    assert(static_cast<bool>(catalog->udp_port(port)) ==
           contains(udp_ports, port));
    assert(static_cast<bool>(catalog->tcp_port(port)) ==
           contains(tcp_ports, port));
  }
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

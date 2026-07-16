#pragma once

#include <cstdint>
#include <memory>
#include <string_view>
#include <utility>

#include "parsing/dissector.hpp"
#include "parsing/network_types.hpp"
#include "pruftnet/parsing/registry.hpp"

namespace pruftnet::parsing::internal {

class DissectorCatalog;

using CatalogHandleIndex = std::uint16_t;

class CatalogRegistrar {
public:
  explicit CatalogRegistrar(DissectorCatalog &catalog) noexcept;

  [[nodiscard]] FieldId field(std::string_view key) const;
  [[nodiscard]] CatalogHandleIndex add(DissectorFunction function,
                                       std::shared_ptr<const void> state);
  template <typename State>
  [[nodiscard]] CatalogHandleIndex add_state(DissectorFunction function,
                                             State state) {
    return add(function, std::make_shared<const State>(std::move(state)));
  }

  void assign_root(CatalogHandleIndex handle, FieldId root_frame,
                   FieldId unknown_data);
  void assign_ethernet(CatalogHandleIndex handle);
  void assign_llc(CatalogHandleIndex handle);
  void assign_snap(CatalogHandleIndex information,
                   CatalogHandleIndex non_information);

  void bind_dlt(std::uint32_t selector, CatalogHandleIndex handle);
  void bind_ethertype(std::uint16_t selector, CatalogHandleIndex handle);
  void bind_ip_protocol(IpFamily family, std::uint8_t selector,
                        CatalogHandleIndex handle);
  void bind_sll_protocol(std::uint16_t selector, CatalogHandleIndex handle);
  void bind_null_family(std::uint32_t selector, CatalogHandleIndex handle);
  void bind_llc_sap(std::uint8_t selector, CatalogHandleIndex handle);
  void bind_snap_pid(std::uint32_t oui, std::uint16_t pid,
                     CatalogHandleIndex handle);
  void bind_udp_port(std::uint16_t selector, CatalogHandleIndex handle);
  void bind_tcp_port(std::uint16_t selector, CatalogHandleIndex handle);

private:
  DissectorCatalog &catalog_;
};

} // namespace pruftnet::parsing::internal

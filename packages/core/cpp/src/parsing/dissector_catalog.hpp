#pragma once

#include <array>
#include <cstdint>
#include <memory>
#include <utility>
#include <vector>

#include "parsing/dissector.hpp"
#include "parsing/dissectors/dissector_states.hpp"
#include "parsing/network_types.hpp"
#include "pruftnet/parsing/registry.hpp"

namespace pruftnet::parsing::internal {

class DissectorCatalog {
public:
  explicit DissectorCatalog(RegistrySnapshotPtr registry);

  DissectorCatalog(const DissectorCatalog &) = delete;
  DissectorCatalog &operator=(const DissectorCatalog &) = delete;

  [[nodiscard]] const RegistrySnapshotPtr &registry() const noexcept;
  [[nodiscard]] const CommonDissectorState &common() const noexcept;
  [[nodiscard]] DissectorHandle root() const noexcept;
  [[nodiscard]] DissectorHandle dlt(std::uint32_t value) const noexcept;
  [[nodiscard]] DissectorHandle ethernet() const noexcept;
  [[nodiscard]] DissectorHandle ethertype(std::uint16_t value) const noexcept;
  [[nodiscard]] DissectorHandle ip_protocol(IpFamily family,
                                            std::uint8_t value) const noexcept;
  [[nodiscard]] DissectorHandle
  sll_protocol(std::uint16_t hardware_type,
               std::uint16_t protocol) const noexcept;
  [[nodiscard]] DissectorHandle null_family(std::uint32_t value) const noexcept;
  [[nodiscard]] DissectorHandle llc() const noexcept;
  [[nodiscard]] DissectorHandle snap(bool information_frame) const noexcept;
  [[nodiscard]] DissectorHandle llc_sap(std::uint8_t value) const noexcept;
  [[nodiscard]] DissectorHandle snap_pid(std::uint32_t oui,
                                         std::uint16_t pid) const noexcept;
  [[nodiscard]] DissectorHandle udp_port(std::uint16_t value) const noexcept;
  [[nodiscard]] DissectorHandle tcp_port(std::uint16_t value) const noexcept;

private:
  [[nodiscard]] std::uint16_t add_handle(DissectorFunction function,
                                         std::shared_ptr<const void> state);
  void bind_dlt(std::uint32_t selector, std::uint16_t handle);
  void bind_ethertype(std::uint16_t selector, std::uint16_t handle);
  void bind_ip_protocol(IpFamily family, std::uint8_t selector,
                        std::uint16_t handle);
  void bind_sll_protocol(std::uint16_t selector, std::uint16_t handle);
  void bind_null_family(std::uint32_t selector, std::uint16_t handle);
  void bind_llc_sap(std::uint8_t selector, std::uint16_t handle);
  void bind_snap_pid(std::uint32_t oui, std::uint16_t pid,
                     std::uint16_t handle);
  void bind_udp_port(std::uint16_t selector, std::uint16_t handle);
  void bind_tcp_port(std::uint16_t selector, std::uint16_t handle);
  [[nodiscard]] DissectorHandle handle(std::uint16_t index) const noexcept;

  RegistrySnapshotPtr registry_;
  std::shared_ptr<const CommonDissectorState> common_;
  std::vector<std::shared_ptr<const void>> states_;
  std::vector<DissectorHandle> handles_;
  std::uint16_t root_ = 0;
  std::uint16_t ethernet_ = 0;
  std::vector<std::pair<std::uint32_t, std::uint16_t>> dlt_;
  std::array<std::uint16_t, 65'536> ethertype_{};
  std::array<std::uint16_t, 256> ipv4_protocol_{};
  std::array<std::uint16_t, 256> ipv6_next_header_{};
  std::vector<std::pair<std::uint16_t, std::uint16_t>> sll_protocol_;
  std::vector<std::pair<std::uint32_t, std::uint16_t>> null_family_;
  std::uint16_t llc_ = 0;
  std::uint16_t snap_information_ = 0;
  std::uint16_t snap_non_information_ = 0;
  std::array<std::uint16_t, 256> llc_sap_{};
  std::vector<std::pair<std::uint64_t, std::uint16_t>> snap_pid_;
  std::array<std::uint16_t, 65'536> udp_port_{};
  std::array<std::uint16_t, 65'536> tcp_port_{};
};

using DissectorCatalogPtr = std::shared_ptr<const DissectorCatalog>;

[[nodiscard]] DissectorCatalogPtr
make_core_dissector_catalog(RegistrySnapshotPtr registry);

} // namespace pruftnet::parsing::internal

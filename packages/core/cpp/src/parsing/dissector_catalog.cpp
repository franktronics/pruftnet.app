#include "parsing/dissector_catalog.hpp"

#include <algorithm>
#include <limits>
#include <stdexcept>

#include "parsing/catalog/catalog_registrar.hpp"
#include "parsing/catalog/catalog_sections.hpp"

namespace pruftnet::parsing::internal {
namespace {

std::uint64_t snap_key(std::uint32_t oui, std::uint16_t pid) noexcept {
  return (static_cast<std::uint64_t>(oui) << 16U) | pid;
}

} // namespace

DissectorCatalog::DissectorCatalog(RegistrySnapshotPtr registry)
    : registry_(std::move(registry)) {
  if (!registry_) {
    throw std::invalid_argument(
        "DissectorCatalog requires a registry snapshot.");
  }
  handles_.push_back({});
  CatalogRegistrar registrar(*this);
  register_core_catalog(registrar);
  const auto link_handles = register_link_catalog(registrar);
  register_network_catalog(registrar);
  register_transport_catalog(registrar);
  register_application_catalog(registrar);
  register_tunnel_catalog(registrar, link_handles);
}

std::uint16_t
DissectorCatalog::add_handle(DissectorFunction function,
                             std::shared_ptr<const void> state_owner) {
  if (function == nullptr || !state_owner ||
      handles_.size() >= std::numeric_limits<std::uint16_t>::max()) {
    throw std::logic_error(
        "Invalid or excessive dissector handle registration.");
  }
  states_.push_back(std::move(state_owner));
  handles_.push_back({function, states_.back().get()});
  return static_cast<std::uint16_t>(handles_.size() - 1);
}

void DissectorCatalog::bind_dlt(std::uint32_t selector,
                                std::uint16_t handle_index) {
  const auto found =
      std::lower_bound(dlt_.begin(), dlt_.end(), selector,
                       [](const auto &entry, std::uint32_t value) {
                         return entry.first < value;
                       });
  if (found != dlt_.end() && found->first == selector) {
    throw std::logic_error("Duplicate DLT dissector registration.");
  }
  dlt_.insert(found, {selector, handle_index});
}

void DissectorCatalog::bind_ethertype(std::uint16_t selector,
                                      std::uint16_t handle_index) {
  if (ethertype_[selector] != 0) {
    throw std::logic_error("Duplicate EtherType dissector registration.");
  }
  ethertype_[selector] = handle_index;
}

void DissectorCatalog::bind_ip_protocol(IpFamily family, std::uint8_t selector,
                                        std::uint16_t handle_index) {
  auto &table = family == IpFamily::V4 ? ipv4_protocol_ : ipv6_next_header_;
  if (table[selector] != 0) {
    throw std::logic_error("Duplicate IP protocol dissector registration.");
  }
  table[selector] = handle_index;
}

void DissectorCatalog::bind_sll_protocol(std::uint16_t selector,
                                         std::uint16_t handle_index) {
  const auto found =
      std::lower_bound(sll_protocol_.begin(), sll_protocol_.end(), selector,
                       [](const auto &entry, std::uint16_t value) {
                         return entry.first < value;
                       });
  if (found != sll_protocol_.end() && found->first == selector) {
    throw std::logic_error(
        "Duplicate Linux cooked protocol dissector registration.");
  }
  sll_protocol_.insert(found, {selector, handle_index});
}

void DissectorCatalog::bind_null_family(std::uint32_t selector,
                                        std::uint16_t handle_index) {
  const auto found =
      std::lower_bound(null_family_.begin(), null_family_.end(), selector,
                       [](const auto &entry, std::uint32_t value) {
                         return entry.first < value;
                       });
  if (found != null_family_.end() && found->first == selector) {
    throw std::logic_error(
        "Duplicate Null/Loopback family dissector registration.");
  }
  null_family_.insert(found, {selector, handle_index});
}

void DissectorCatalog::bind_llc_sap(std::uint8_t selector,
                                    std::uint16_t handle_index) {
  if (llc_sap_[selector] != 0) {
    throw std::logic_error("Duplicate LLC SAP dissector registration.");
  }
  llc_sap_[selector] = handle_index;
}

void DissectorCatalog::bind_snap_pid(std::uint32_t oui, std::uint16_t pid,
                                     std::uint16_t handle_index) {
  const auto selector = snap_key(oui, pid);
  const auto found =
      std::lower_bound(snap_pid_.begin(), snap_pid_.end(), selector,
                       [](const auto &entry, std::uint64_t value) {
                         return entry.first < value;
                       });
  if (found != snap_pid_.end() && found->first == selector) {
    throw std::logic_error("Duplicate SNAP PID dissector registration.");
  }
  snap_pid_.insert(found, {selector, handle_index});
}

void DissectorCatalog::bind_udp_port(std::uint16_t selector,
                                     std::uint16_t handle_index) {
  if (udp_port_[selector] != 0) {
    throw std::logic_error("Duplicate UDP port dissector registration.");
  }
  udp_port_[selector] = handle_index;
}

void DissectorCatalog::bind_tcp_port(std::uint16_t selector,
                                     std::uint16_t handle_index) {
  if (tcp_port_[selector] != 0) {
    throw std::logic_error("Duplicate TCP port dissector registration.");
  }
  tcp_port_[selector] = handle_index;
}

DissectorHandle DissectorCatalog::handle(std::uint16_t index) const noexcept {
  return index < handles_.size() ? handles_[index] : DissectorHandle{};
}

const RegistrySnapshotPtr &DissectorCatalog::registry() const noexcept {
  return registry_;
}

FieldId DissectorCatalog::root_frame_field() const noexcept {
  return root_frame_;
}

FieldId DissectorCatalog::unknown_data_field() const noexcept {
  return unknown_data_;
}

DissectorHandle DissectorCatalog::root() const noexcept {
  return handle(root_);
}

DissectorHandle DissectorCatalog::dlt(std::uint32_t value) const noexcept {
  const auto found =
      std::lower_bound(dlt_.begin(), dlt_.end(), value,
                       [](const auto &entry, std::uint32_t selector) {
                         return entry.first < selector;
                       });
  return found != dlt_.end() && found->first == value ? handle(found->second)
                                                      : DissectorHandle{};
}

DissectorHandle DissectorCatalog::ethernet() const noexcept {
  return handle(ethernet_);
}

DissectorHandle
DissectorCatalog::ethertype(std::uint16_t value) const noexcept {
  return handle(ethertype_[value]);
}

DissectorHandle
DissectorCatalog::ip_protocol(IpFamily family,
                              std::uint8_t value) const noexcept {
  return handle(family == IpFamily::V4 ? ipv4_protocol_[value]
                                       : ipv6_next_header_[value]);
}

DissectorHandle
DissectorCatalog::sll_protocol(std::uint16_t,
                               std::uint16_t protocol) const noexcept {
  const auto found =
      std::lower_bound(sll_protocol_.begin(), sll_protocol_.end(), protocol,
                       [](const auto &entry, std::uint16_t value) {
                         return entry.first < value;
                       });
  return found != sll_protocol_.end() && found->first == protocol
             ? handle(found->second)
             : DissectorHandle{};
}

DissectorHandle
DissectorCatalog::null_family(std::uint32_t value) const noexcept {
  const auto found =
      std::lower_bound(null_family_.begin(), null_family_.end(), value,
                       [](const auto &entry, std::uint32_t selector) {
                         return entry.first < selector;
                       });
  return found != null_family_.end() && found->first == value
             ? handle(found->second)
             : DissectorHandle{};
}

DissectorHandle DissectorCatalog::llc() const noexcept { return handle(llc_); }

DissectorHandle DissectorCatalog::snap(bool information_frame) const noexcept {
  return handle(information_frame ? snap_information_ : snap_non_information_);
}

DissectorHandle DissectorCatalog::llc_sap(std::uint8_t value) const noexcept {
  return handle(llc_sap_[value]);
}

DissectorHandle DissectorCatalog::snap_pid(std::uint32_t oui,
                                           std::uint16_t pid) const noexcept {
  const auto selector = snap_key(oui, pid);
  const auto found =
      std::lower_bound(snap_pid_.begin(), snap_pid_.end(), selector,
                       [](const auto &entry, std::uint64_t value) {
                         return entry.first < value;
                       });
  return found != snap_pid_.end() && found->first == selector
             ? handle(found->second)
             : DissectorHandle{};
}

DissectorHandle DissectorCatalog::udp_port(std::uint16_t value) const noexcept {
  return handle(udp_port_[value]);
}

DissectorHandle DissectorCatalog::tcp_port(std::uint16_t value) const noexcept {
  return handle(tcp_port_[value]);
}

DissectorCatalogPtr make_core_dissector_catalog(RegistrySnapshotPtr registry) {
  return std::make_shared<const DissectorCatalog>(std::move(registry));
}

} // namespace pruftnet::parsing::internal

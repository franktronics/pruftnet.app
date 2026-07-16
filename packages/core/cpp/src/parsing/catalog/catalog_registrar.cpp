#include "parsing/catalog/catalog_registrar.hpp"

#include <functional>
#include <stdexcept>
#include <string>
#include <utility>
#include <variant>

#include "parsing/dissector_catalog.hpp"

namespace pruftnet::parsing::internal {

CatalogRegistrar::CatalogRegistrar(DissectorCatalog &catalog) noexcept
    : catalog_(catalog) {}

FieldId CatalogRegistrar::field(std::string_view key) const {
  const auto result = catalog_.registry_->field(key);
  if (const auto *descriptor =
          std::get_if<std::reference_wrapper<const FieldDescriptor>>(&result)) {
    return descriptor->get().id;
  }
  throw std::logic_error("The core dissector catalog is missing field " +
                         std::string(key));
}

CatalogHandleIndex CatalogRegistrar::add(DissectorFunction function,
                                         std::shared_ptr<const void> state) {
  return catalog_.add_handle(function, std::move(state));
}

void CatalogRegistrar::assign_root(CatalogHandleIndex handle,
                                   FieldId root_frame, FieldId unknown_data) {
  catalog_.root_ = handle;
  catalog_.root_frame_ = root_frame;
  catalog_.unknown_data_ = unknown_data;
}

void CatalogRegistrar::assign_ethernet(CatalogHandleIndex handle) {
  catalog_.ethernet_ = handle;
}

void CatalogRegistrar::assign_llc(CatalogHandleIndex handle) {
  catalog_.llc_ = handle;
}

void CatalogRegistrar::assign_snap(CatalogHandleIndex information,
                                   CatalogHandleIndex non_information) {
  catalog_.snap_information_ = information;
  catalog_.snap_non_information_ = non_information;
}

void CatalogRegistrar::bind_dlt(std::uint32_t selector,
                                CatalogHandleIndex handle) {
  catalog_.bind_dlt(selector, handle);
}

void CatalogRegistrar::bind_ethertype(std::uint16_t selector,
                                      CatalogHandleIndex handle) {
  catalog_.bind_ethertype(selector, handle);
}

void CatalogRegistrar::bind_ip_protocol(IpFamily family, std::uint8_t selector,
                                        CatalogHandleIndex handle) {
  catalog_.bind_ip_protocol(family, selector, handle);
}

void CatalogRegistrar::bind_sll_protocol(std::uint16_t selector,
                                         CatalogHandleIndex handle) {
  catalog_.bind_sll_protocol(selector, handle);
}

void CatalogRegistrar::bind_null_family(std::uint32_t selector,
                                        CatalogHandleIndex handle) {
  catalog_.bind_null_family(selector, handle);
}

void CatalogRegistrar::bind_llc_sap(std::uint8_t selector,
                                    CatalogHandleIndex handle) {
  catalog_.bind_llc_sap(selector, handle);
}

void CatalogRegistrar::bind_snap_pid(std::uint32_t oui, std::uint16_t pid,
                                     CatalogHandleIndex handle) {
  catalog_.bind_snap_pid(oui, pid, handle);
}

void CatalogRegistrar::bind_udp_port(std::uint16_t selector,
                                     CatalogHandleIndex handle) {
  catalog_.bind_udp_port(selector, handle);
}

void CatalogRegistrar::bind_tcp_port(std::uint16_t selector,
                                     CatalogHandleIndex handle) {
  catalog_.bind_tcp_port(selector, handle);
}

} // namespace pruftnet::parsing::internal

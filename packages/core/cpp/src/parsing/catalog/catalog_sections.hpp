#pragma once

#include "parsing/catalog/catalog_registrar.hpp"

namespace pruftnet::parsing::internal {

struct LinkCatalogHandles {
  CatalogHandleIndex ethernet;
};

void register_core_catalog(CatalogRegistrar &registrar);
[[nodiscard]] LinkCatalogHandles
register_link_catalog(CatalogRegistrar &registrar);

} // namespace pruftnet::parsing::internal

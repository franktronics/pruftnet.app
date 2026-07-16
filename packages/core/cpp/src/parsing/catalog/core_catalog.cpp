#include "parsing/catalog/catalog_sections.hpp"

#include "parsing/catalog/catalog_registrar.hpp"
#include "parsing/dissectors/link/frame_dissector.hpp"

namespace pruftnet::parsing::internal {

void register_core_catalog(CatalogRegistrar &registrar) {
  const auto root_frame = registrar.field("root.frame");
  const auto unknown_data = registrar.field("unknown.data");
  const auto root = registrar.add_state(
      dissect_frame, FrameDissectorState{
                         registrar.field("root.captured_length"),
                         registrar.field("root.reported_length"),
                         registrar.field("root.link_type"),
                     });
  registrar.assign_root(root, root_frame, unknown_data);
}

} // namespace pruftnet::parsing::internal

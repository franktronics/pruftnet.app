#pragma once

#include <algorithm>
#include <cassert>
#include <cstddef>
#include <functional>
#include <string_view>
#include <variant>

#include "pruftnet/parsing/parsed_tree.hpp"
#include "pruftnet/parsing/registry.hpp"

namespace pruftnet::tests {

inline parsing::FieldId field_id(const parsing::RegistrySnapshot &registry,
                                 std::string_view key) {
  const auto result = registry.field(key);
  assert(std::holds_alternative<
         std::reference_wrapper<const parsing::FieldDescriptor>>(result));
  return std::get<std::reference_wrapper<const parsing::FieldDescriptor>>(
             result)
      .get()
      .id;
}

inline const parsing::ParsedFieldNode &
node(const parsing::ParsedPacketTree &tree,
     const parsing::RegistrySnapshot &registry, std::string_view key) {
  const auto id = field_id(registry, key);
  const auto found = std::find_if(
      tree.nodes().begin(), tree.nodes().end(),
      [id](const auto &candidate) { return candidate.field_id == id; });
  assert(found != tree.nodes().end());
  return *found;
}

inline std::size_t node_count(const parsing::ParsedPacketTree &tree,
                              const parsing::RegistrySnapshot &registry,
                              std::string_view key) {
  const auto id = field_id(registry, key);
  return static_cast<std::size_t>(std::count_if(
      tree.nodes().begin(), tree.nodes().end(),
      [id](const auto &candidate) { return candidate.field_id == id; }));
}

} // namespace pruftnet::tests

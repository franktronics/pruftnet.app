#include "pruftnet/sniffing/sniffer_options.hpp"

#include "parsing/core_link_types.hpp"

namespace pruftnet::sniffing {

std::vector<int> default_supported_link_types() {
  std::vector<int> link_types;
  const auto definitions = parsing::internal::core_link_types();
  link_types.reserve(definitions.size());
  for (const auto &definition : definitions) {
    link_types.push_back(definition.value);
  }
  return link_types;
}

SnifferOptions::SnifferOptions()
    : accepted_link_types(default_supported_link_types()) {}

} // namespace pruftnet::sniffing

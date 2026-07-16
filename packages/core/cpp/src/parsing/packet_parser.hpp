#pragma once

#include "parsing/dissector_catalog.hpp"
#include "parsing/reassembly_store.hpp"
#include "pruftnet/parsing/parse_budget.hpp"
#include "pruftnet/parsing/parsed_tree.hpp"
#include "pruftnet/parsing/registry.hpp"
#include "pruftnet/sniffing/packet.hpp"

namespace pruftnet::parsing::internal {

class PacketParser {
public:
  explicit PacketParser(RegistrySnapshotPtr registry, ParseBudget budget = {},
                        ReassemblyBudget reassembly_budget = {});
  explicit PacketParser(DissectorCatalogPtr catalog, ParseBudget budget = {},
                        ReassemblyBudget reassembly_budget = {});

  [[nodiscard]] ParsedPacketTree parse(const sniffing::RawPacketView &packet);
  void recycle(ParsedPacketTree tree) noexcept;

private:
  DissectorCatalogPtr catalog_;
  ParseBudget budget_;
  ReassemblyStore reassembly_;
  ParsedPacketTree recycled_tree_;
  bool has_recycled_tree_ = false;
};

} // namespace pruftnet::parsing::internal

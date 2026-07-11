#pragma once

#include "pruftnet/parsing/parse_budget.hpp"
#include "pruftnet/parsing/parsed_tree.hpp"
#include "pruftnet/parsing/registry.hpp"
#include "pruftnet/sniffing/packet.hpp"
#include "parsing/dissector_catalog.hpp"

namespace pruftnet::parsing::internal {

class PacketParser {
public:
    explicit PacketParser(RegistrySnapshotPtr registry, ParseBudget budget = {});
    explicit PacketParser(DissectorCatalogPtr catalog, ParseBudget budget = {});

    [[nodiscard]] ParsedPacketTree parse(const sniffing::RawPacketView& packet);
    void recycle(ParsedPacketTree tree) noexcept;

private:
    DissectorCatalogPtr catalog_;
    ParseBudget budget_;
    ParsedPacketTree recycled_tree_;
    bool has_recycled_tree_ = false;
};

} // namespace pruftnet::parsing::internal

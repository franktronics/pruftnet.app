#pragma once

#include "pruftnet/parsing/parse_budget.hpp"
#include "pruftnet/parsing/parsed_tree.hpp"
#include "pruftnet/parsing/registry.hpp"
#include "pruftnet/sniffing/packet.hpp"

namespace pruftnet::parsing::internal {

class PacketParser {
public:
    struct FieldIds;

    explicit PacketParser(RegistrySnapshotPtr registry, ParseBudget budget = {});

    [[nodiscard]] ParsedPacketTree parse(const sniffing::RawPacketView& packet);
    void recycle(ParsedPacketTree tree) noexcept;

private:
    RegistrySnapshotPtr registry_;
    ParseBudget budget_;
    std::shared_ptr<const FieldIds> fields_;
    ParsedPacketTree recycled_tree_;
    bool has_recycled_tree_ = false;
};

} // namespace pruftnet::parsing::internal

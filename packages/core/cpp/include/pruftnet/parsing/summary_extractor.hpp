#pragma once

#include <cstddef>
#include <memory>
#include <string>
#include <vector>

#include "pruftnet/parsing/parsed_tree.hpp"

namespace pruftnet::parsing {

inline constexpr std::size_t kPacketSummaryColumnMaxBytes = 256;

struct PacketSummaryFields {
    std::vector<ProtocolId> protocol_path;
    std::string source;
    std::string destination;
    std::string protocol;
    std::string length;
    std::string info;
};

class SummaryExtractor {
public:
    explicit SummaryExtractor(const RegistrySnapshot& registry);
    [[nodiscard]] PacketSummaryFields extract(const sniffing::RawPacketView& raw,
                                              const ParsedPacketTree& tree) const;

private:
    struct Fields;
    std::shared_ptr<const Fields> fields_;
};

} // namespace pruftnet::parsing

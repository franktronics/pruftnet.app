#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <memory>
#include <utility>
#include <variant>

#include "pruftnet/parsing/parsed_tree.hpp"

namespace pruftnet::tests {

struct PacketTreeFixture {
    pruftnet::parsing::RegistrySnapshotPtr registry;
    pruftnet::parsing::ParsedPacketTree tree;
};

inline PacketTreeFixture make_packet_tree_fixture() {
    using namespace pruftnet::parsing;

    RegistryBuilder registry_builder;
    const auto protocol = std::get<ProtocolId>(registry_builder.register_protocol("synthetic", "Synthetic"));
    const auto root = std::get<FieldId>(
        registry_builder.register_field(protocol, "synthetic.root", "Synthetic root", FieldValueType::Protocol));
    const auto number = std::get<FieldId>(
        registry_builder.register_field(protocol, "synthetic.number", "Number", FieldValueType::Unsigned));
    const auto bytes =
        std::get<FieldId>(registry_builder.register_field(protocol, "synthetic.bytes", "Bytes", FieldValueType::Bytes));
    const auto text = std::get<FieldId>(
        registry_builder.register_field(protocol, "synthetic.text", "Generated text", FieldValueType::GeneratedText));
    auto registry = std::make_shared<const RegistrySnapshot>(std::get<RegistrySnapshot>(registry_builder.freeze()));

    const pruftnet::sniffing::PacketKey packet_key{
        .capture_id = {.high = 0x1020304050607080ULL, .low = 0x8877665544332211ULL},
        .packet_id = 42,
    };
    ParsedPacketTreeBuilder tree_builder(registry, packet_key);
    constexpr std::array captured{
        std::byte{0x00}, std::byte{0x11}, std::byte{0x22}, std::byte{0x33},
        std::byte{0x44}, std::byte{0x55}, std::byte{0x66}, std::byte{0x77},
    };
    constexpr std::array derived{
        std::byte{0xAA},
        std::byte{0xBB},
        std::byte{0xCC},
        std::byte{0xDD},
    };
    const auto captured_id =
        std::get<DataSourceId>(tree_builder.add_data_source("Captured frame", captured, DataSourceKind::Captured));
    const std::array contributors{
        ParsedContributor{
            .packet_key = packet_key,
            .source_offset = 0,
            .source_length = 2,
            .destination_offset = 0,
            .destination_length = 2,
        },
        ParsedContributor{
            .packet_key =
                {
                    .capture_id = packet_key.capture_id,
                    .packet_id = 43,
                },
            .source_offset = 4,
            .source_length = 2,
            .destination_offset = 2,
            .destination_length = 2,
        },
    };
    const auto derived_id = std::get<DataSourceId>(
        tree_builder.add_data_source("Derived bytes", derived, DataSourceKind::Derived, contributors));
    const auto root_index =
        std::get<std::uint32_t>(tree_builder.add_none(root, kNoParentIndex, captured_id, 0, captured.size()));
    (void)std::get<std::uint32_t>(tree_builder.add_unsigned(number, root_index, captured_id, 0, 2, 0x11));
    (void)std::get<std::uint32_t>(tree_builder.add_unsigned(number, root_index, captured_id, 2, 2, 0x2233));
    (void)std::get<std::uint32_t>(tree_builder.add_bytes(bytes, root_index, derived_id, 0, derived.size(), derived));
    (void)std::get<std::uint32_t>(tree_builder.add_generated_text(text, root_index, captured_id, "synthetic"));
    auto tree = std::get<ParsedPacketTree>(tree_builder.finalize());
    return PacketTreeFixture{std::move(registry), std::move(tree)};
}

} // namespace pruftnet::tests

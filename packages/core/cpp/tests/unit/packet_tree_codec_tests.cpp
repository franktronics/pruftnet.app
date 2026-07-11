#include <algorithm>
#include <cassert>
#include <cstddef>
#include <cstdint>
#include <span>
#include <variant>
#include <vector>

#include "flatbuffers/base.h"
#include "packet_tree_generated.h"
#include "pruftnet/parsing/packet_tree_codec.hpp"
#include "tests/support/packet_tree_fixture.hpp"

namespace {

using namespace pruftnet::parsing;

template <typename Value> const Value& value(const PacketTreeCodecResult<Value>& result) {
    assert(std::holds_alternative<Value>(result));
    return std::get<Value>(result);
}

template <typename Value> PacketTreeCodecError error(const PacketTreeCodecResult<Value>& result) {
    assert(std::holds_alternative<PacketTreeCodecError>(result));
    return std::get<PacketTreeCodecError>(result);
}

void round_trip_preserves_tree_without_unpacking() {
    const auto fixture = pruftnet::tests::make_packet_tree_fixture();
    assert(fixture.registry->revision().value == 13'891'723'788'706'789'614ULL);
    PacketTreeEncoder encoder;
    const auto encoded_result = encoder.encode(fixture.tree);
    const auto encoded = value(encoded_result);
    assert(!encoded.empty());

    const auto verified_result = verify_packet_tree(encoded, *fixture.registry);
    const auto& verified = value(verified_result);
    assert(verified.packet_key() == fixture.tree.packet_key());
    assert(verified.registry_revision() == fixture.registry->revision());
    assert(verified.condition() == ParseCondition::Complete);
    assert(verified.node_count() == fixture.tree.nodes().size());
    assert(verified.data_source_count() == 2);
    assert(verified.contributor_count() == 2);
    assert(verified.source_name(0) == "Captured frame");
    assert(verified.source_name(1) == "Derived bytes");
    assert(verified.source_bytes(1).size() == 4);
    assert(verified.source_bytes(1)[2] == std::byte{0xCC});
    assert(value(verified.node(1)).field_id == fixture.tree.nodes()[1].field_id);
    assert(value(verified.node(2)).field_id == fixture.tree.nodes()[1].field_id);
    assert(value(verified.contributor(1)).packet_key.packet_id == 43);
    assert(verified.checksum() != 0);
}

void malformed_and_incompatible_buffers_are_rejected() {
    const auto fixture = pruftnet::tests::make_packet_tree_fixture();
    PacketTreeEncoder encoder;
    const auto encoded = value(encoder.encode(fixture.tree));
    std::vector<std::byte> copy(encoded.begin(), encoded.end());

    const auto truncated = std::span(copy).first(copy.size() - 1);
    assert(error(verify_packet_tree(truncated, *fixture.registry)).code ==
           PacketTreeCodecErrorCode::MalformedFlatBuffer);

    copy[4] ^= std::byte{0x01};
    assert(error(verify_packet_tree(copy, *fixture.registry)).code == PacketTreeCodecErrorCode::WrongFileIdentifier);

    RegistryBuilder other_builder;
    const auto protocol = std::get<ProtocolId>(other_builder.register_protocol("other", "Other"));
    const auto field = other_builder.register_field(protocol, "other.root", "Root", FieldValueType::Protocol);
    assert(std::holds_alternative<FieldId>(field));
    const auto other_registry = std::get<RegistrySnapshot>(other_builder.freeze());
    assert(error(verify_packet_tree(encoded, other_registry)).code ==
           PacketTreeCodecErrorCode::RegistryRevisionMismatch);
}

void codec_budgets_are_checked_before_traversal() {
    const auto fixture = pruftnet::tests::make_packet_tree_fixture();
    PacketTreeEncoder encoder;
    const auto encoded = value(encoder.encode(fixture.tree));

    ParseBudget node_budget;
    node_budget.max_nodes = fixture.tree.nodes().size() - 1;
    assert(error(verify_packet_tree(encoded, *fixture.registry, node_budget)).code ==
           PacketTreeCodecErrorCode::TooManyNodes);

    ParseBudget message_budget;
    message_budget.max_encoded_bytes = encoded.size() - 1;
    assert(error(verify_packet_tree(encoded, *fixture.registry, message_budget)).code ==
           PacketTreeCodecErrorCode::MessageTooLarge);
    assert(error(encoder.encode(fixture.tree, node_budget)).code == PacketTreeCodecErrorCode::TooManyNodes);
}

void structurally_valid_invalid_indexes_are_rejected() {
    const auto fixture = pruftnet::tests::make_packet_tree_fixture();
    PacketTreeEncoder encoder;
    const auto encoded = value(encoder.encode(fixture.tree));
    std::vector<std::byte> corrupted(encoded.begin(), encoded.end());
    const auto* envelope = Pruftnet::Wire::GetPacketTreeEnvelope(corrupted.data());
    const auto* node = envelope->packet_tree()->nodes()->Get(1);
    auto* node_bytes = const_cast<std::uint8_t*>(reinterpret_cast<const std::uint8_t*>(node));
    flatbuffers::WriteScalar<std::uint32_t>(node_bytes + 20, kNoParentIndex);
    assert(error(verify_packet_tree(corrupted, *fixture.registry)).code == PacketTreeCodecErrorCode::InvalidParent);

    std::vector<std::byte> invalid_scalar(encoded.begin(), encoded.end());
    const auto* scalar_envelope = Pruftnet::Wire::GetPacketTreeEnvelope(invalid_scalar.data());
    const auto* scalar_node = scalar_envelope->packet_tree()->nodes()->Get(1);
    auto* scalar_bytes = const_cast<std::uint8_t*>(reinterpret_cast<const std::uint8_t*>(scalar_node));
    flatbuffers::WriteScalar<std::uint64_t>(scalar_bytes + 8, 1);
    assert(error(verify_packet_tree(invalid_scalar, *fixture.registry)).code == PacketTreeCodecErrorCode::InvalidValue);

    std::vector<std::byte> orphan_contributor(encoded.begin(), encoded.end());
    const auto* contributor_envelope = Pruftnet::Wire::GetPacketTreeEnvelope(orphan_contributor.data());
    const auto* derived_source = contributor_envelope->packet_tree()->data_sources()->Get(1);
    auto* source_bytes = const_cast<std::uint8_t*>(reinterpret_cast<const std::uint8_t*>(derived_source));
    flatbuffers::WriteScalar<std::uint32_t>(source_bytes + 24, 1);
    assert(error(verify_packet_tree(orphan_contributor, *fixture.registry)).code ==
           PacketTreeCodecErrorCode::InvalidRange);
}

void encoder_storage_is_reusable() {
    const auto fixture = pruftnet::tests::make_packet_tree_fixture();
    PacketTreeEncoder encoder;
    const auto first = value(encoder.encode(fixture.tree));
    const std::vector<std::byte> first_copy(first.begin(), first.end());
    const auto second = value(encoder.encode(fixture.tree));
    assert(second.size() == first_copy.size());
    assert(std::equal(second.begin(), second.end(), first_copy.begin(), first_copy.end()));
}

} // namespace

int main() {
    round_trip_preserves_tree_without_unpacking();
    malformed_and_incompatible_buffers_are_rejected();
    codec_budgets_are_checked_before_traversal();
    structurally_valid_invalid_indexes_are_rejected();
    encoder_storage_is_reusable();
    return 0;
}

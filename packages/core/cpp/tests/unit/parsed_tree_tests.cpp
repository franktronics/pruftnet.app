#include <array>
#include <bit>
#include <cassert>
#include <cstddef>
#include <cstdint>
#include <limits>
#include <memory>
#include <span>
#include <string_view>
#include <type_traits>
#include <variant>

#include "pruftnet/parsing/parsed_tree.hpp"

namespace {

using namespace pruftnet::parsing;
namespace sniffing = pruftnet::sniffing;

static_assert(std::is_trivially_copyable_v<ParsedFieldNode>);
static_assert(std::is_trivially_copyable_v<ParsedDataSource>);
static_assert(std::is_trivially_copyable_v<ParsedContributor>);

template <typename Value> const Value& value(const TreeResult<Value>& result) {
    assert(std::holds_alternative<Value>(result));
    return std::get<Value>(result);
}

template <typename Value> TreeBuildError error(const TreeResult<Value>& result) {
    assert(std::holds_alternative<TreeBuildError>(result));
    return std::get<TreeBuildError>(result);
}

template <typename Value> const Value& registry_value(const RegistryResult<Value>& result) {
    assert(std::holds_alternative<Value>(result));
    return std::get<Value>(result);
}

struct TestRegistry {
    RegistrySnapshotPtr snapshot;
    FieldId root;
    FieldId unsigned_field;
    FieldId signed_field;
    FieldId boolean_field;
    FieldId bytes_field;
    FieldId string_field;
    FieldId text_field;
};

TestRegistry make_registry() {
    RegistryBuilder builder;
    const auto protocol_result = builder.register_protocol("test", "Test");
    const ProtocolId protocol = registry_value(protocol_result);
    const auto root = builder.register_field(protocol, "test.root", "Root", FieldValueType::Protocol);
    const auto unsigned_field = builder.register_field(protocol, "test.unsigned", "Unsigned", FieldValueType::Unsigned);
    const auto signed_field = builder.register_field(protocol, "test.signed", "Signed", FieldValueType::Signed);
    const auto boolean_field = builder.register_field(protocol, "test.boolean", "Boolean", FieldValueType::Boolean);
    const auto bytes_field = builder.register_field(protocol, "test.bytes", "Bytes", FieldValueType::Bytes);
    const auto string_field = builder.register_field(protocol, "test.string", "String", FieldValueType::String);
    const auto text_field = builder.register_field(protocol, "test.text", "Text", FieldValueType::GeneratedText);
    const auto snapshot_result = builder.freeze();
    assert(std::holds_alternative<RegistrySnapshot>(snapshot_result));
    return TestRegistry{std::make_shared<const RegistrySnapshot>(std::get<RegistrySnapshot>(snapshot_result)),
                        registry_value(root),
                        registry_value(unsigned_field),
                        registry_value(signed_field),
                        registry_value(boolean_field),
                        registry_value(bytes_field),
                        registry_value(string_field),
                        registry_value(text_field)};
}

constexpr sniffing::PacketKey packet_key(std::uint64_t packet_id = 7) {
    return sniffing::PacketKey{sniffing::CaptureId{0x1122334455667788ULL, 0x8877665544332211ULL}, packet_id};
}

constexpr std::array<std::byte, 8> kCaptured{
    std::byte{0x01}, std::byte{0x02}, std::byte{0x03}, std::byte{0x04},
    std::byte{0x05}, std::byte{0x06}, std::byte{0x07}, std::byte{0x08},
};

void all_values_and_repeated_fields_are_contiguous() {
    const TestRegistry registry = make_registry();
    ParsedPacketTreeBuilder builder(registry.snapshot, packet_key());
    const auto captured_result = builder.add_data_source("captured", kCaptured, DataSourceKind::Captured);
    const DataSourceId captured = value(captured_result);
    assert(captured == 0);

    const auto root_result = builder.add_none(registry.root, kNoParentIndex, captured, 0, kCaptured.size());
    const std::uint32_t root = value(root_result);
    const auto unsigned_result = builder.add_unsigned(registry.unsigned_field, root, captured, 0, 1, UINT64_MAX);
    const auto signed_result = builder.add_signed(registry.signed_field, root, captured, 1, 1, -42);
    const auto boolean_result = builder.add_boolean(registry.boolean_field, root, captured, 2, 1, true);
    const std::array<std::byte, 3> bytes{std::byte{0xAA}, std::byte{0xBB}, std::byte{0xCC}};
    const auto bytes_result = builder.add_bytes(registry.bytes_field, root, captured, 3, 3, bytes);
    const auto repeated_result =
        builder.add_bytes(registry.bytes_field, root, captured, 6, 2, std::span(bytes).first(2));
    const auto string_result = builder.add_string(registry.string_field, root, captured, 0, 2, "ok");
    const auto text_result = builder.add_generated_text(registry.text_field, root, captured, "generated");
    assert(value(unsigned_result) == 1);
    assert(value(signed_result) == 2);
    assert(value(boolean_result) == 3);
    assert(value(bytes_result) == 4);
    assert(value(repeated_result) == 5);
    assert(value(string_result) == 6);
    assert(value(text_result) == 7);

    const auto tree_result = builder.finalize();
    const auto& tree = value(tree_result);
    assert(tree.packet_key() == packet_key());
    assert(tree.registry_revision() == registry.snapshot->revision());
    assert(tree.condition() == ParseCondition::Complete);
    assert(tree.nodes().size() == 8);
    assert(tree.nodes()[1].value_tag == ParsedValueTag::Unsigned);
    assert(tree.nodes()[1].value_low == UINT64_MAX);
    assert(tree.nodes()[2].value_tag == ParsedValueTag::Signed);
    assert(std::bit_cast<std::int64_t>(tree.nodes()[2].value_low) == -42);
    assert(tree.nodes()[2].value_high == UINT64_MAX);
    assert(tree.nodes()[3].value_low == 1);
    assert(tree.node_bytes(tree.nodes()[4]).size() == 3);
    assert(tree.node_bytes(tree.nodes()[4])[1] == std::byte{0xBB});
    assert(tree.node_bytes(tree.nodes()[5]).size() == 2);
    assert(tree.node_text(tree.nodes()[6]) == "ok");
    assert(tree.node_text(tree.nodes()[7]) == "generated");
    assert((tree.nodes()[7].flags & ParsedNodeFlagGenerated) != 0);
    assert(tree.value_arena().size() == 5);
}

void multiple_sources_preserve_contributors_and_packet_keys() {
    const TestRegistry registry = make_registry();
    ParsedPacketTreeBuilder builder(registry.snapshot, packet_key());
    const auto captured = builder.add_data_source("wire", kCaptured, DataSourceKind::Captured);
    assert(value(captured) == 0);
    const std::array<std::byte, 4> derived{std::byte{0x10}, std::byte{0x20}, std::byte{0x30}, std::byte{0x40}};
    const std::array contributors{
        ParsedContributor{packet_key(100), 2, 2, 0, 2},
        ParsedContributor{packet_key(101), 6, 2, 2, 2},
    };
    const auto derived_result = builder.add_data_source("reassembled", derived, DataSourceKind::Derived, contributors);
    const DataSourceId derived_id = value(derived_result);
    assert(derived_id == 1);
    const auto root = builder.add_none(registry.root, kNoParentIndex, 0, 0, 8);
    assert(std::holds_alternative<std::uint32_t>(root));
    const auto tree_result = builder.finalize();
    const auto& tree = value(tree_result);
    assert(tree.data_sources().size() == 2);
    assert(tree.source_name(tree.data_sources()[1]) == "reassembled");
    const auto stored_bytes = tree.source_bytes(tree.data_sources()[1]);
    assert(stored_bytes.size() == derived.size());
    assert(stored_bytes[0] == derived[0]);
    assert(stored_bytes[3] == derived[3]);
    const auto stored = tree.source_contributors(tree.data_sources()[1]);
    assert(stored.size() == 2);
    assert(stored[0].packet_key == packet_key(100));
    assert(stored[1].packet_key.capture_id == packet_key(101).capture_id);
    assert(stored[1].packet_key.packet_id == 101);
    assert(stored[1].destination_offset == 2);
}

void structure_source_and_type_validation_is_transactional() {
    const TestRegistry registry = make_registry();
    ParsedPacketTreeBuilder builder(registry.snapshot, packet_key());
    const auto wrong_first = builder.add_data_source("derived", kCaptured, DataSourceKind::Derived);
    assert(error(wrong_first).code == TreeBuildErrorCode::InvalidFirstSource);
    const auto source = builder.add_data_source("wire", kCaptured, DataSourceKind::Captured);
    assert(std::holds_alternative<DataSourceId>(source));
    const auto second_captured = builder.add_data_source("wire2", kCaptured, DataSourceKind::Captured);
    assert(error(second_captured).code == TreeBuildErrorCode::InvalidDataSourceKind);
    const auto invalid_kind = builder.add_data_source("invalid", {}, static_cast<DataSourceKind>(255));
    assert(error(invalid_kind).code == TreeBuildErrorCode::InvalidDataSourceKind);
    const std::string_view invalid_utf8("\xC0\xAF", 2);
    const auto invalid_name = builder.add_data_source(invalid_utf8, {}, DataSourceKind::Derived);
    assert(error(invalid_name).code == TreeBuildErrorCode::InvalidUtf8);

    const auto unknown = builder.add_none(FieldId{999}, kNoParentIndex, 0, 0, 1);
    const auto wrong_root_type = builder.add_unsigned(registry.unsigned_field, kNoParentIndex, 0, 0, 1, 1);
    const auto wrong_source = builder.add_none(registry.root, kNoParentIndex, 9, 0, 1);
    const auto wrong_range = builder.add_none(registry.root, kNoParentIndex, 0, 7, 2);
    assert(error(unknown).code == TreeBuildErrorCode::UnknownField);
    assert(error(wrong_root_type).code == TreeBuildErrorCode::InvalidRoot);
    assert(error(wrong_source).code == TreeBuildErrorCode::InvalidDataSource);
    assert(error(wrong_range).code == TreeBuildErrorCode::InvalidRange);
    assert(builder.nodes().empty());

    const auto root_result = builder.add_none(registry.root, kNoParentIndex, 0, 0, 8);
    const std::uint32_t root = value(root_result);
    const auto no_parent = builder.add_boolean(registry.boolean_field, kNoParentIndex, 0, 0, 1, true);
    const auto future_parent = builder.add_boolean(registry.boolean_field, root + 10, 0, 0, 1, true);
    const auto wrong_type = builder.add_string(registry.bytes_field, root, 0, 0, 1, "x");
    const auto invalid_text = builder.add_generated_text(registry.text_field, root, 0, invalid_utf8);
    const auto overflow =
        builder.add_boolean(registry.boolean_field, root, 0, std::numeric_limits<std::size_t>::max(), 1, true);
    assert(error(no_parent).code == TreeBuildErrorCode::InvalidParent);
    assert(error(future_parent).code == TreeBuildErrorCode::InvalidParent);
    assert(error(wrong_type).code == TreeBuildErrorCode::ValueTypeMismatch);
    assert(error(invalid_text).code == TreeBuildErrorCode::InvalidUtf8);
    assert(error(overflow).code == TreeBuildErrorCode::NumericOverflow);
    assert(builder.nodes().size() == 1);

    const ParsedContributor bad_destination{packet_key(2), 0, 1, 8, 1};
    const auto bad_contributor =
        builder.add_data_source("bad", kCaptured, DataSourceKind::Derived, std::span(&bad_destination, 1));
    assert(error(bad_contributor).code == TreeBuildErrorCode::InvalidRange);
    assert(builder.data_sources().size() == 1);
}

void count_and_depth_budgets_accept_exact_limits() {
    const TestRegistry registry = make_registry();
    ParseBudget budget;
    budget.max_nodes = 2;
    budget.max_depth = 2;
    budget.max_data_sources = 1;
    ParsedPacketTreeBuilder builder(registry.snapshot, packet_key(), budget);
    const auto source = builder.add_data_source("wire", kCaptured, DataSourceKind::Captured);
    const auto extra_source = builder.add_data_source("extra", {}, DataSourceKind::Derived);
    assert(value(source) == 0);
    assert(error(extra_source).code == TreeBuildErrorCode::MaxDataSources);
    const auto root = builder.add_none(registry.root, kNoParentIndex, 0, 0, 8);
    const auto child = builder.add_boolean(registry.boolean_field, value(root), 0, 0, 1, true);
    const auto too_many = builder.add_boolean(registry.boolean_field, value(root), 0, 1, 1, false);
    assert(value(child) == 1);
    assert(error(too_many).code == TreeBuildErrorCode::MaxNodes);

    ParseBudget depth_budget;
    depth_budget.max_depth = 1;
    ParsedPacketTreeBuilder depth_builder(registry.snapshot, packet_key(), depth_budget);
    const auto depth_source = depth_builder.add_data_source("wire", kCaptured, DataSourceKind::Captured);
    assert(std::holds_alternative<DataSourceId>(depth_source));
    const auto depth_root = depth_builder.add_none(registry.root, kNoParentIndex, 0, 0, 8);
    const auto too_deep = depth_builder.add_boolean(registry.boolean_field, value(depth_root), 0, 0, 1, true);
    assert(error(too_deep).code == TreeBuildErrorCode::MaxDepth);
}

void arena_and_contributor_budgets_accept_exact_limits() {
    const TestRegistry registry = make_registry();
    ParseBudget budget;
    budget.max_string_bytes = 5;
    budget.max_value_bytes = 2;
    budget.max_source_bytes = 8;
    budget.max_contributors = 1;
    ParsedPacketTreeBuilder builder(registry.snapshot, packet_key(), budget);
    const auto source = builder.add_data_source("wire", kCaptured, DataSourceKind::Captured);
    assert(std::holds_alternative<DataSourceId>(source));
    const auto root = builder.add_none(registry.root, kNoParentIndex, 0, 0, 8);
    const std::array<std::byte, 2> bytes{std::byte{1}, std::byte{2}};
    const auto exact_value = builder.add_bytes(registry.bytes_field, value(root), 0, 0, 2, bytes);
    const auto excess_value = builder.add_bytes(registry.bytes_field, value(root), 0, 0, 1, std::span(bytes).first(1));
    const auto exact_string = builder.add_generated_text(registry.text_field, value(root), 0, "x");
    const auto excess_string = builder.add_generated_text(registry.text_field, value(root), 0, "y");
    assert(std::holds_alternative<std::uint32_t>(exact_value));
    assert(error(excess_value).code == TreeBuildErrorCode::MaxValueBytes);
    assert(std::holds_alternative<std::uint32_t>(exact_string));
    assert(error(excess_string).code == TreeBuildErrorCode::MaxStringBytes);

    const ParsedContributor contributor{packet_key(3), 0, 1, 0, 0};
    const std::array<std::byte, 1> derived{std::byte{1}};
    const auto exact_contributor = builder.add_data_source("", {}, DataSourceKind::Derived, std::span(&contributor, 1));
    const auto excess_source_bytes = builder.add_data_source("", derived, DataSourceKind::Derived);
    const auto excess_contributor =
        builder.add_data_source("", {}, DataSourceKind::Derived, std::span(&contributor, 1));
    assert(std::holds_alternative<DataSourceId>(exact_contributor));
    assert(error(excess_source_bytes).code == TreeBuildErrorCode::MaxSourceBytes);
    assert(error(excess_contributor).code == TreeBuildErrorCode::MaxContributors);
}

void encoded_budget_and_rejection_leave_a_finalizable_tree() {
    const TestRegistry registry = make_registry();
    ParseBudget budget;
    budget.max_encoded_bytes = 512 + sizeof(ParsedDataSource) + 1 + kCaptured.size() + sizeof(ParsedFieldNode);
    ParsedPacketTreeBuilder builder(registry.snapshot, packet_key(), budget);
    const auto source = builder.add_data_source("w", kCaptured, DataSourceKind::Captured);
    const auto root = builder.add_none(registry.root, kNoParentIndex, 0, 0, 8);
    const auto excess = builder.add_boolean(registry.boolean_field, value(root), 0, 0, 1, true);
    assert(std::holds_alternative<DataSourceId>(source));
    assert(value(root) == 0);
    assert(error(excess).code == TreeBuildErrorCode::MaxEncodedBytes);
    assert(builder.condition() == ParseCondition::ResourceLimit);
    assert(builder.nodes().size() == 1);
    assert(builder.data_sources().size() == 1);
    const auto tree_result = builder.finalize();
    assert(value(tree_result).condition() == ParseCondition::ResourceLimit);
    assert(value(tree_result).nodes().size() == 1);
    const auto second_finalize = builder.finalize();
    assert(error(second_finalize).code == TreeBuildErrorCode::Finalized);
}

void empty_and_condition_behavior_is_explicit() {
    const TestRegistry registry = make_registry();
    ParsedPacketTreeBuilder builder(registry.snapshot, packet_key());
    const auto empty = builder.finalize();
    assert(error(empty).code == TreeBuildErrorCode::Empty);
    const auto condition = builder.set_condition(ParseCondition::Malformed);
    assert(std::holds_alternative<std::monostate>(condition));
    assert(builder.condition() == ParseCondition::Malformed);
    const auto invalid_condition = builder.set_condition(static_cast<ParseCondition>(255));
    assert(error(invalid_condition).code == TreeBuildErrorCode::InvalidCondition);

    ParsedPacketTreeBuilder invalid_key_builder(registry.snapshot, {});
    const auto source = invalid_key_builder.add_data_source("wire", kCaptured, DataSourceKind::Captured);
    assert(std::holds_alternative<DataSourceId>(source));
    const auto root = invalid_key_builder.add_none(registry.root, kNoParentIndex, 0, 0, kCaptured.size());
    assert(std::holds_alternative<std::uint32_t>(root));
    assert(error(invalid_key_builder.finalize()).code == TreeBuildErrorCode::InvalidPacketKey);
}

} // namespace

int main() {
    all_values_and_repeated_fields_are_contiguous();
    multiple_sources_preserve_contributors_and_packet_keys();
    structure_source_and_type_validation_is_transactional();
    count_and_depth_budgets_accept_exact_limits();
    arena_and_contributor_budgets_accept_exact_limits();
    encoded_budget_and_rejection_leave_a_finalizable_tree();
    empty_and_condition_behavior_is_explicit();
    return 0;
}

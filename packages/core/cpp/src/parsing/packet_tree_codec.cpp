#include "pruftnet/parsing/packet_tree_codec.hpp"

#include <algorithm>
#include <limits>
#include <new>
#include <utility>
#include <vector>

#include "flatbuffers/flatbuffers.h"
#include "flatbuffers/verifier.h"
#include "packet_tree_generated.h"
#include "parsing/utf8.hpp"

namespace pruftnet::parsing {
namespace {

namespace Wire = Pruftnet::Wire;

PacketTreeCodecError codec_error(PacketTreeCodecErrorCode code, std::size_t index = 0, std::uint64_t expected = 0,
                                 std::uint64_t actual = 0) noexcept {
    return PacketTreeCodecError{code, index, expected, actual};
}

bool valid_packet_key(const sniffing::PacketKey& key) noexcept {
    return !key.capture_id.is_nil() && key.packet_id != 0;
}

bool valid_range(std::uint32_t offset, std::uint32_t length, std::size_t size) noexcept {
    return static_cast<std::uint64_t>(offset) + static_cast<std::uint64_t>(length) <= size;
}

template <typename Vector> std::size_t vector_size(const Vector* vector) noexcept {
    return vector == nullptr ? 0 : vector->size();
}

template <typename Vector> std::span<const std::byte> byte_span(const Vector* vector) noexcept {
    if (vector == nullptr || vector->size() == 0) {
        return {};
    }
    return {reinterpret_cast<const std::byte*>(vector->Data()), vector->size()};
}

const Wire::PacketTreePayload* payload(std::span<const std::byte> bytes) noexcept {
    return Wire::GetPacketTreeEnvelope(bytes.data())->packet_tree();
}

sniffing::PacketKey from_wire(const Wire::PacketKey* key) noexcept {
    if (key == nullptr) {
        return {};
    }
    return {
        .capture_id = {.high = key->capture_id_high(), .low = key->capture_id_low()},
        .packet_id = key->packet_id(),
    };
}

ParsedValueTag from_wire(Wire::ValueTag tag) noexcept { return static_cast<ParsedValueTag>(tag); }

ParseCondition from_wire(Wire::ParseCondition condition) noexcept { return static_cast<ParseCondition>(condition); }

DataSourceKind from_wire(Wire::DataSourceKind kind) noexcept { return static_cast<DataSourceKind>(kind); }

Wire::ValueTag to_wire(ParsedValueTag tag) noexcept { return static_cast<Wire::ValueTag>(tag); }

Wire::ParseCondition to_wire(ParseCondition condition) noexcept { return static_cast<Wire::ParseCondition>(condition); }

Wire::DataSourceKind to_wire(DataSourceKind kind) noexcept { return static_cast<Wire::DataSourceKind>(kind); }

bool value_type_matches(FieldValueType type, Wire::ValueTag tag) noexcept {
    switch (type) {
    case FieldValueType::Protocol:
        return tag == Wire::ValueTag_None;
    case FieldValueType::Unsigned:
        return tag == Wire::ValueTag_Unsigned;
    case FieldValueType::Signed:
        return tag == Wire::ValueTag_Signed;
    case FieldValueType::Boolean:
        return tag == Wire::ValueTag_Boolean;
    case FieldValueType::Bytes:
        return tag == Wire::ValueTag_Bytes;
    case FieldValueType::String:
        return tag == Wire::ValueTag_String;
    case FieldValueType::GeneratedText:
        return tag == Wire::ValueTag_GeneratedText;
    }
    return false;
}

PacketTreeCodecResult<std::monostate> validate_semantics(std::span<const std::byte> bytes,
                                                         const RegistrySnapshot& registry,
                                                         const ParseBudget& budget) noexcept {
    const auto* envelope = Wire::GetPacketTreeEnvelope(bytes.data());
    if (envelope->format_version() != kPacketTreeFormatVersion) {
        return codec_error(PacketTreeCodecErrorCode::UnsupportedVersion, 0, kPacketTreeFormatVersion,
                           envelope->format_version());
    }
    if (envelope->kind() != Wire::MessageKind_PacketTree) {
        return codec_error(PacketTreeCodecErrorCode::WrongMessageKind, 0, Wire::MessageKind_PacketTree,
                           envelope->kind());
    }
    const auto* tree = envelope->packet_tree();
    if (tree == nullptr) {
        return codec_error(PacketTreeCodecErrorCode::MissingPayload);
    }
    if (tree->registry_revision() != registry.revision().value) {
        return codec_error(PacketTreeCodecErrorCode::RegistryRevisionMismatch, 0, registry.revision().value,
                           tree->registry_revision());
    }
    const auto packet_key = from_wire(tree->packet_key());
    if (!valid_packet_key(packet_key)) {
        return codec_error(PacketTreeCodecErrorCode::InvalidPacketKey);
    }
    if (tree->condition() < Wire::ParseCondition_Complete || tree->condition() > Wire::ParseCondition_ResourceLimit) {
        return codec_error(PacketTreeCodecErrorCode::InvalidParseCondition);
    }

    const auto node_count = vector_size(tree->nodes());
    const auto source_count = vector_size(tree->data_sources());
    const auto contributor_count = vector_size(tree->contributors());
    const auto string_size = vector_size(tree->string_arena());
    const auto value_size = vector_size(tree->value_arena());
    const auto source_size = vector_size(tree->source_arena());
    if (node_count > budget.max_nodes) {
        return codec_error(PacketTreeCodecErrorCode::TooManyNodes, 0, budget.max_nodes, node_count);
    }
    if (source_count == 0 || source_count > budget.max_data_sources) {
        return codec_error(PacketTreeCodecErrorCode::TooManyDataSources, 0, budget.max_data_sources, source_count);
    }
    if (contributor_count > budget.max_contributors) {
        return codec_error(PacketTreeCodecErrorCode::TooManyContributors, 0, budget.max_contributors,
                           contributor_count);
    }
    if (string_size > budget.max_string_bytes) {
        return codec_error(PacketTreeCodecErrorCode::StringArenaTooLarge, 0, budget.max_string_bytes, string_size);
    }
    if (value_size > budget.max_value_bytes) {
        return codec_error(PacketTreeCodecErrorCode::ValueArenaTooLarge, 0, budget.max_value_bytes, value_size);
    }
    if (source_size > budget.max_source_bytes) {
        return codec_error(PacketTreeCodecErrorCode::SourceArenaTooLarge, 0, budget.max_source_bytes, source_size);
    }

    std::size_t expected_contributor_offset = 0;
    for (std::size_t index = 0; index < source_count; ++index) {
        const auto* source = tree->data_sources()->Get(index);
        if (source->id() != index || source->kind() < Wire::DataSourceKind_Captured ||
            source->kind() > Wire::DataSourceKind_Derived ||
            (index == 0) != (source->kind() == Wire::DataSourceKind_Captured) || source->reserved_byte() != 0 ||
            source->reserved_short() != 0) {
            return codec_error(PacketTreeCodecErrorCode::InvalidDataSource, index);
        }
        if (!valid_range(source->name_offset(), source->name_length(), string_size) ||
            !valid_range(source->source_offset(), source->source_length(), source_size) ||
            !valid_range(source->contributor_offset(), source->contributor_count(), contributor_count) ||
            source->contributor_offset() != expected_contributor_offset) {
            return codec_error(PacketTreeCodecErrorCode::InvalidRange, index);
        }
        const auto source_name = byte_span(tree->string_arena()).subspan(source->name_offset(), source->name_length());
        if (!internal::is_valid_utf8(source_name)) {
            return codec_error(PacketTreeCodecErrorCode::InvalidUtf8, index);
        }
        for (std::size_t offset = 0; offset < source->contributor_count(); ++offset) {
            const auto contributor_index = static_cast<std::size_t>(source->contributor_offset()) + offset;
            const auto* contributor = tree->contributors()->Get(contributor_index);
            const sniffing::PacketKey contributor_key{
                .capture_id =
                    {
                        .high = contributor->capture_id_high(),
                        .low = contributor->capture_id_low(),
                    },
                .packet_id = contributor->packet_id(),
            };
            if (!valid_packet_key(contributor_key) ||
                static_cast<std::uint64_t>(contributor->source_offset()) + contributor->source_length() > UINT32_MAX ||
                !valid_range(contributor->destination_offset(), contributor->destination_length(),
                             source->source_length())) {
                return codec_error(PacketTreeCodecErrorCode::InvalidRange, contributor_index);
            }
        }
        expected_contributor_offset += source->contributor_count();
    }
    if (expected_contributor_offset != contributor_count) {
        return codec_error(PacketTreeCodecErrorCode::InvalidRange, source_count);
    }

    if (node_count == 0) {
        return codec_error(PacketTreeCodecErrorCode::InvalidParent);
    }
    for (std::size_t index = 0; index < node_count; ++index) {
        const auto* node = tree->nodes()->Get(index);
        const auto field_result = registry.field(FieldId{node->field_id()});
        const auto* field = std::get_if<std::reference_wrapper<const FieldDescriptor>>(&field_result);
        if (field == nullptr) {
            return codec_error(PacketTreeCodecErrorCode::UnknownField, index, 0, node->field_id());
        }
        if (node->value_tag() < Wire::ValueTag_None || node->value_tag() > Wire::ValueTag_GeneratedText ||
            !value_type_matches(field->get().value_type, node->value_tag()) || node->reserved_byte() != 0 ||
            node->reserved_short() != 0) {
            return codec_error(PacketTreeCodecErrorCode::InvalidValue, index);
        }
        const auto expected_signed_high = (node->value_low() >> 63U) == 0 ? 0 : UINT64_MAX;
        switch (node->value_tag()) {
        case Wire::ValueTag_None:
        case Wire::ValueTag_Bytes:
        case Wire::ValueTag_String:
        case Wire::ValueTag_GeneratedText:
            if (node->value_low() != 0 || node->value_high() != 0) {
                return codec_error(PacketTreeCodecErrorCode::InvalidValue, index);
            }
            break;
        case Wire::ValueTag_Unsigned:
            if (node->value_high() != 0) {
                return codec_error(PacketTreeCodecErrorCode::InvalidValue, index);
            }
            break;
        case Wire::ValueTag_Signed:
            if (node->value_high() != expected_signed_high) {
                return codec_error(PacketTreeCodecErrorCode::InvalidValue, index);
            }
            break;
        case Wire::ValueTag_Boolean:
            if (node->value_low() > 1 || node->value_high() != 0) {
                return codec_error(PacketTreeCodecErrorCode::InvalidValue, index);
            }
            break;
        default:
            return codec_error(PacketTreeCodecErrorCode::InvalidValue, index);
        }
        if ((index == 0 && node->parent_index() != kNoParentIndex) ||
            (index != 0 && (node->parent_index() == kNoParentIndex || node->parent_index() >= index))) {
            return codec_error(PacketTreeCodecErrorCode::InvalidParent, index);
        }
        std::size_t depth = 1;
        for (auto parent = node->parent_index(); parent != kNoParentIndex;
             parent = tree->nodes()->Get(parent)->parent_index()) {
            ++depth;
        }
        if (depth > budget.max_depth) {
            return codec_error(PacketTreeCodecErrorCode::MaxDepth, index, budget.max_depth, depth);
        }
        if (node->data_source_id() >= source_count) {
            return codec_error(PacketTreeCodecErrorCode::InvalidDataSource, index);
        }
        const auto* source = tree->data_sources()->Get(node->data_source_id());
        const bool generated_zero_range =
            (node->flags() & ParsedNodeFlagGenerated) != 0 && node->offset() == 0 && node->length() == 0;
        const bool source_backed = (node->flags() & ParsedNodeFlagSourceBacked) != 0;
        constexpr auto known_flags = ParsedNodeFlagGenerated | ParsedNodeFlagSourceBacked;
        if ((node->flags() & ~known_flags) != 0 || (source_backed && node->value_tag() != Wire::ValueTag_Bytes)) {
            return codec_error(PacketTreeCodecErrorCode::InvalidValue, index);
        }
        if (!generated_zero_range && !valid_range(node->offset(), node->length(), source->source_length())) {
            return codec_error(PacketTreeCodecErrorCode::InvalidRange, index);
        }
        if (index != 0 && !generated_zero_range) {
            const auto* parent = tree->nodes()->Get(node->parent_index());
            const auto child_end = static_cast<std::uint64_t>(node->offset()) + node->length();
            const auto parent_end = static_cast<std::uint64_t>(parent->offset()) + parent->length();
            if (parent->data_source_id() == node->data_source_id() &&
                (node->offset() < parent->offset() || child_end > parent_end)) {
                return codec_error(PacketTreeCodecErrorCode::InvalidRange, index);
            }
        }
        if (node->value_tag() == Wire::ValueTag_Bytes) {
            if (source_backed) {
                if (node->value_offset() != 0 || node->value_length() != 0) {
                    return codec_error(PacketTreeCodecErrorCode::InvalidValue, index);
                }
            } else if (!valid_range(node->value_offset(), node->value_length(), value_size)) {
                return codec_error(PacketTreeCodecErrorCode::InvalidValue, index);
            }
        } else if (node->value_tag() == Wire::ValueTag_String || node->value_tag() == Wire::ValueTag_GeneratedText) {
            if (!valid_range(node->value_offset(), node->value_length(), string_size)) {
                return codec_error(PacketTreeCodecErrorCode::InvalidValue, index);
            }
            const auto text = byte_span(tree->string_arena()).subspan(node->value_offset(), node->value_length());
            if (!internal::is_valid_utf8(text)) {
                return codec_error(PacketTreeCodecErrorCode::InvalidUtf8, index);
            }
        } else if (node->value_offset() != 0 || node->value_length() != 0) {
            return codec_error(PacketTreeCodecErrorCode::InvalidValue, index);
        }
    }
    return std::monostate{};
}

} // namespace

class PacketTreeEncoder::Impl {
public:
    flatbuffers::FlatBufferBuilder builder{1'024};
    std::vector<Wire::FieldNode> nodes;
    std::vector<Wire::DataSourceRecord> sources;
    std::vector<Wire::ContributorRecord> contributors;
};

VerifiedPacketTreeView::VerifiedPacketTreeView(std::span<const std::byte> bytes) noexcept : bytes_(bytes) {}

sniffing::PacketKey VerifiedPacketTreeView::packet_key() const noexcept {
    return from_wire(payload(bytes_)->packet_key());
}

RegistryRevision VerifiedPacketTreeView::registry_revision() const noexcept {
    return RegistryRevision{payload(bytes_)->registry_revision()};
}

ParseCondition VerifiedPacketTreeView::condition() const noexcept { return from_wire(payload(bytes_)->condition()); }

std::size_t VerifiedPacketTreeView::node_count() const noexcept { return vector_size(payload(bytes_)->nodes()); }

std::size_t VerifiedPacketTreeView::data_source_count() const noexcept {
    return vector_size(payload(bytes_)->data_sources());
}

std::size_t VerifiedPacketTreeView::contributor_count() const noexcept {
    return vector_size(payload(bytes_)->contributors());
}

PacketTreeCodecResult<ParsedFieldNode> VerifiedPacketTreeView::node(std::size_t index) const noexcept {
    const auto* nodes = payload(bytes_)->nodes();
    if (nodes == nullptr || index >= nodes->size()) {
        return codec_error(PacketTreeCodecErrorCode::InvalidRange, index, vector_size(nodes), index + 1);
    }
    const auto* value = nodes->Get(index);
    return ParsedFieldNode{
        .field_id = FieldId{value->field_id()},
        .parent_index = value->parent_index(),
        .data_source_id = value->data_source_id(),
        .offset = value->offset(),
        .length = value->length(),
        .flags = value->flags(),
        .value_tag = from_wire(value->value_tag()),
        .value_low = value->value_low(),
        .value_high = value->value_high(),
        .value_offset = value->value_offset(),
        .value_length = value->value_length(),
    };
}

PacketTreeCodecResult<ParsedDataSource> VerifiedPacketTreeView::data_source(std::size_t index) const noexcept {
    const auto* sources = payload(bytes_)->data_sources();
    if (sources == nullptr || index >= sources->size()) {
        return codec_error(PacketTreeCodecErrorCode::InvalidRange, index, vector_size(sources), index + 1);
    }
    const auto* value = sources->Get(index);
    return ParsedDataSource{
        .id = value->id(),
        .kind = from_wire(value->kind()),
        .name_offset = value->name_offset(),
        .name_length = value->name_length(),
        .source_offset = value->source_offset(),
        .source_length = value->source_length(),
        .contributor_offset = value->contributor_offset(),
        .contributor_count = value->contributor_count(),
    };
}

PacketTreeCodecResult<ParsedContributor> VerifiedPacketTreeView::contributor(std::size_t index) const noexcept {
    const auto* contributors = payload(bytes_)->contributors();
    if (contributors == nullptr || index >= contributors->size()) {
        return codec_error(PacketTreeCodecErrorCode::InvalidRange, index, vector_size(contributors), index + 1);
    }
    const auto* value = contributors->Get(index);
    return ParsedContributor{
        .packet_key =
            {
                .capture_id = {.high = value->capture_id_high(), .low = value->capture_id_low()},
                .packet_id = value->packet_id(),
            },
        .source_offset = value->source_offset(),
        .source_length = value->source_length(),
        .destination_offset = value->destination_offset(),
        .destination_length = value->destination_length(),
    };
}

std::span<const std::byte> VerifiedPacketTreeView::string_arena() const noexcept {
    return byte_span(payload(bytes_)->string_arena());
}

std::span<const std::byte> VerifiedPacketTreeView::value_arena() const noexcept {
    return byte_span(payload(bytes_)->value_arena());
}

std::span<const std::byte> VerifiedPacketTreeView::source_arena() const noexcept {
    return byte_span(payload(bytes_)->source_arena());
}

std::string_view VerifiedPacketTreeView::source_name(std::size_t index) const noexcept {
    const auto result = data_source(index);
    const auto* source = std::get_if<ParsedDataSource>(&result);
    if (source == nullptr || !valid_range(source->name_offset, source->name_length, string_arena().size())) {
        return {};
    }
    const auto bytes = string_arena().subspan(source->name_offset, source->name_length);
    return {reinterpret_cast<const char*>(bytes.data()), bytes.size()};
}

std::span<const std::byte> VerifiedPacketTreeView::source_bytes(std::size_t index) const noexcept {
    const auto result = data_source(index);
    const auto* source = std::get_if<ParsedDataSource>(&result);
    if (source == nullptr || !valid_range(source->source_offset, source->source_length, source_arena().size())) {
        return {};
    }
    return source_arena().subspan(source->source_offset, source->source_length);
}

std::uint64_t VerifiedPacketTreeView::checksum() const noexcept {
    const auto key = packet_key();
    std::uint64_t checksum = key.capture_id.high ^ key.capture_id.low ^ key.packet_id ^ registry_revision().value;
    for (std::size_t index = 0; index < node_count(); ++index) {
        const auto result = node(index);
        const auto* value = std::get_if<ParsedFieldNode>(&result);
        checksum += static_cast<std::uint64_t>(value->field_id.value) + value->parent_index + value->data_source_id +
                    value->offset + value->length;
        checksum += value->value_low + value->value_high + value->value_offset + value->value_length + value->flags;
    }
    for (std::size_t index = 0; index < data_source_count(); ++index) {
        const auto result = data_source(index);
        const auto* value = std::get_if<ParsedDataSource>(&result);
        checksum += static_cast<std::uint64_t>(value->id) + value->name_offset + value->name_length +
                    value->source_offset + value->source_length;
        checksum += value->contributor_offset + value->contributor_count;
    }
    for (std::size_t index = 0; index < contributor_count(); ++index) {
        const auto result = contributor(index);
        const auto* value = std::get_if<ParsedContributor>(&result);
        checksum ^= value->packet_key.capture_id.high ^ value->packet_key.capture_id.low ^ value->packet_key.packet_id;
        checksum += static_cast<std::uint64_t>(value->source_offset) + value->source_length +
                    value->destination_offset + value->destination_length;
    }
    for (const auto value : string_arena()) {
        checksum += std::to_integer<std::uint8_t>(value);
    }
    for (const auto value : value_arena()) {
        checksum += std::to_integer<std::uint8_t>(value);
    }
    for (const auto value : source_arena()) {
        checksum += std::to_integer<std::uint8_t>(value);
    }
    return checksum;
}

PacketTreeEncoder::PacketTreeEncoder() : impl_(std::make_unique<Impl>()) {}

PacketTreeEncoder::~PacketTreeEncoder() = default;

PacketTreeEncoder::PacketTreeEncoder(PacketTreeEncoder&&) noexcept = default;

PacketTreeEncoder& PacketTreeEncoder::operator=(PacketTreeEncoder&&) noexcept = default;

PacketTreeCodecResult<std::span<const std::byte>> PacketTreeEncoder::encode(const ParsedPacketTree& tree,
                                                                            const ParseBudget& budget) {
    try {
        if (tree.nodes().size() > budget.max_nodes) {
            return codec_error(PacketTreeCodecErrorCode::TooManyNodes, 0, budget.max_nodes, tree.nodes().size());
        }
        if (tree.data_sources().size() > budget.max_data_sources) {
            return codec_error(PacketTreeCodecErrorCode::TooManyDataSources, 0, budget.max_data_sources,
                               tree.data_sources().size());
        }
        if (tree.contributors().size() > budget.max_contributors) {
            return codec_error(PacketTreeCodecErrorCode::TooManyContributors, 0, budget.max_contributors,
                               tree.contributors().size());
        }
        if (tree.string_arena().size() > budget.max_string_bytes ||
            tree.value_arena().size() > budget.max_value_bytes ||
            tree.source_arena().size() > budget.max_source_bytes) {
            return codec_error(PacketTreeCodecErrorCode::MessageTooLarge);
        }

        impl_->builder.Clear();
        impl_->nodes.clear();
        impl_->sources.clear();
        impl_->contributors.clear();
        impl_->nodes.reserve(tree.nodes().size());
        impl_->sources.reserve(tree.data_sources().size());
        impl_->contributors.reserve(tree.contributors().size());

        for (const auto& node : tree.nodes()) {
            impl_->nodes.emplace_back(node.value_low, node.value_high, node.field_id.value, node.parent_index,
                                      node.data_source_id, node.offset, node.length, node.flags, node.value_offset,
                                      node.value_length, to_wire(node.value_tag), 0, 0);
        }
        for (const auto& source : tree.data_sources()) {
            impl_->sources.emplace_back(source.id, source.name_offset, source.name_length, source.source_offset,
                                        source.source_length, source.contributor_offset, source.contributor_count,
                                        to_wire(source.kind), 0, 0);
        }
        for (const auto& contributor : tree.contributors()) {
            impl_->contributors.emplace_back(contributor.packet_key.capture_id.high,
                                             contributor.packet_key.capture_id.low, contributor.packet_key.packet_id,
                                             contributor.source_offset, contributor.source_length,
                                             contributor.destination_offset, contributor.destination_length);
        }

        const auto node_vector = impl_->builder.CreateVectorOfStructs(impl_->nodes);
        const auto source_vector = impl_->builder.CreateVectorOfStructs(impl_->sources);
        const auto contributor_vector = impl_->builder.CreateVectorOfStructs(impl_->contributors);
        const auto string_vector = impl_->builder.CreateVector(
            reinterpret_cast<const std::uint8_t*>(tree.string_arena().data()), tree.string_arena().size());
        const auto value_vector = impl_->builder.CreateVector(
            reinterpret_cast<const std::uint8_t*>(tree.value_arena().data()), tree.value_arena().size());
        const auto source_bytes_vector = impl_->builder.CreateVector(
            reinterpret_cast<const std::uint8_t*>(tree.source_arena().data()), tree.source_arena().size());
        const Wire::PacketKey packet_key(tree.packet_key().capture_id.high, tree.packet_key().capture_id.low,
                                         tree.packet_key().packet_id);
        const auto packet_tree = Wire::CreatePacketTreePayload(
            impl_->builder, tree.registry_revision().value, &packet_key, to_wire(tree.condition()), node_vector,
            source_vector, contributor_vector, string_vector, value_vector, source_bytes_vector);
        const auto envelope = Wire::CreatePacketTreeEnvelope(impl_->builder, kPacketTreeFormatVersion,
                                                             Wire::MessageKind_PacketTree, packet_tree);
        Wire::FinishPacketTreeEnvelopeBuffer(impl_->builder, envelope);
        if (impl_->builder.GetSize() > budget.max_encoded_bytes) {
            return codec_error(PacketTreeCodecErrorCode::MessageTooLarge, 0, budget.max_encoded_bytes,
                               impl_->builder.GetSize());
        }
        return std::span<const std::byte>(reinterpret_cast<const std::byte*>(impl_->builder.GetBufferPointer()),
                                          impl_->builder.GetSize());
    } catch (const std::bad_alloc&) {
        return codec_error(PacketTreeCodecErrorCode::AllocationFailed);
    }
}

PacketTreeCodecResult<VerifiedPacketTreeView> verify_packet_tree(std::span<const std::byte> bytes,
                                                                 const RegistrySnapshot& registry,
                                                                 const ParseBudget& budget) noexcept {
    if (bytes.size() > budget.max_encoded_bytes) {
        return codec_error(PacketTreeCodecErrorCode::MessageTooLarge, 0, budget.max_encoded_bytes, bytes.size());
    }
    if (bytes.size() < sizeof(flatbuffers::uoffset_t) + flatbuffers::kFileIdentifierLength) {
        return codec_error(PacketTreeCodecErrorCode::MalformedFlatBuffer);
    }
    if (!Wire::PacketTreeEnvelopeBufferHasIdentifier(bytes.data())) {
        return codec_error(PacketTreeCodecErrorCode::WrongFileIdentifier);
    }
    const auto maximum_table_count = std::numeric_limits<flatbuffers::uoffset_t>::max();
    const auto node_tables = std::min<std::size_t>(maximum_table_count, budget.max_nodes);
    const auto source_tables = std::min<std::size_t>(maximum_table_count - node_tables, budget.max_data_sources);
    const auto fixed_tables = std::min<std::size_t>(maximum_table_count - node_tables - source_tables, 8);
    const auto maximum_tables =
        static_cast<flatbuffers::uoffset_t>(std::max<std::size_t>(16, node_tables + source_tables + fixed_tables));
    flatbuffers::Verifier verifier(reinterpret_cast<const std::uint8_t*>(bytes.data()), bytes.size(), 16,
                                   maximum_tables);
    if (!Wire::VerifyPacketTreeEnvelopeBuffer(verifier)) {
        return codec_error(PacketTreeCodecErrorCode::MalformedFlatBuffer);
    }
    const auto semantics = validate_semantics(bytes, registry, budget);
    if (const auto* error = std::get_if<PacketTreeCodecError>(&semantics)) {
        return *error;
    }
    return VerifiedPacketTreeView(bytes);
}

} // namespace pruftnet::parsing

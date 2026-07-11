#include "pruftnet/parsing/parsed_tree.hpp"

#include <algorithm>
#include <bit>
#include <limits>
#include <new>
#include <stdexcept>
#include <utility>

#include "parsing/utf8.hpp"

namespace pruftnet::parsing {
namespace {

bool checked_add(std::size_t left, std::size_t right, std::size_t& result) noexcept {
    if (right > std::numeric_limits<std::size_t>::max() - left) {
        return false;
    }
    result = left + right;
    return true;
}

bool fits_u32(std::size_t value) noexcept { return value <= std::numeric_limits<std::uint32_t>::max(); }

template <typename Value> void reserve_for_append(std::vector<Value>& values, std::size_t required, std::size_t limit) {
    if (required <= values.capacity()) {
        return;
    }
    const auto doubled = values.capacity() > limit / 2 ? limit : values.capacity() * 2;
    const auto target = std::min(limit, std::max(required, std::max<std::size_t>(8, doubled)));
    values.reserve(target);
}

template <typename Value>
std::span<const Value> safe_slice(std::span<const Value> arena, std::uint32_t offset, std::uint32_t length) noexcept {
    const std::size_t start = offset;
    const std::size_t count = length;
    if (start > arena.size() || count > arena.size() - start) {
        return {};
    }
    return arena.subspan(start, count);
}

} // namespace

const sniffing::PacketKey& ParsedPacketTree::packet_key() const noexcept { return packet_key_; }

RegistryRevision ParsedPacketTree::registry_revision() const noexcept { return registry_revision_; }

ParseCondition ParsedPacketTree::condition() const noexcept { return condition_; }

std::span<const ParsedFieldNode> ParsedPacketTree::nodes() const noexcept { return nodes_; }

std::span<const ParsedDataSource> ParsedPacketTree::data_sources() const noexcept { return data_sources_; }

std::span<const ParsedContributor> ParsedPacketTree::contributors() const noexcept { return contributors_; }

std::span<const char> ParsedPacketTree::string_arena() const noexcept { return string_arena_; }

std::span<const std::byte> ParsedPacketTree::value_arena() const noexcept { return value_arena_; }

std::span<const std::byte> ParsedPacketTree::source_arena() const noexcept { return source_arena_; }

std::string_view ParsedPacketTree::source_name(const ParsedDataSource& source) const noexcept {
    const auto slice = safe_slice<char>(string_arena_, source.name_offset, source.name_length);
    if (slice.empty()) {
        return {};
    }
    return std::string_view(slice.data(), slice.size());
}

std::span<const std::byte> ParsedPacketTree::source_bytes(const ParsedDataSource& source) const noexcept {
    return safe_slice<std::byte>(source_arena_, source.source_offset, source.source_length);
}

std::span<const ParsedContributor>
ParsedPacketTree::source_contributors(const ParsedDataSource& source) const noexcept {
    return safe_slice<ParsedContributor>(contributors_, source.contributor_offset, source.contributor_count);
}

std::span<const std::byte> ParsedPacketTree::node_bytes(const ParsedFieldNode& node) const noexcept {
    if (node.value_tag != ParsedValueTag::Bytes) {
        return {};
    }
    if ((node.flags & ParsedNodeFlagSourceBacked) != 0 && node.data_source_id < data_sources_.size()) {
        const auto& source = data_sources_[node.data_source_id];
        return safe_slice<std::byte>(source_arena_, static_cast<std::size_t>(source.source_offset) + node.offset,
                                     node.length);
    }
    return safe_slice<std::byte>(value_arena_, node.value_offset, node.value_length);
}

std::string_view ParsedPacketTree::node_text(const ParsedFieldNode& node) const noexcept {
    if (node.value_tag != ParsedValueTag::String && node.value_tag != ParsedValueTag::GeneratedText) {
        return {};
    }
    const auto slice = safe_slice<char>(string_arena_, node.value_offset, node.value_length);
    if (slice.empty()) {
        return {};
    }
    return std::string_view(slice.data(), slice.size());
}

ParsedPacketTreeBuilder::ParsedPacketTreeBuilder(RegistrySnapshotPtr registry, sniffing::PacketKey packet_key,
                                                 ParseBudget budget)
    : ParsedPacketTreeBuilder(std::move(registry), packet_key, ParsedPacketTree{}, budget) {}

ParsedPacketTreeBuilder::ParsedPacketTreeBuilder(RegistrySnapshotPtr registry, sniffing::PacketKey packet_key,
                                                 ParsedPacketTree storage, ParseBudget budget)
    : registry_(std::move(registry)), budget_(budget), tree_(std::move(storage)) {
    if (!registry_) {
        throw std::invalid_argument("ParsedPacketTreeBuilder requires a registry snapshot.");
    }
    tree_.nodes_.clear();
    tree_.data_sources_.clear();
    tree_.contributors_.clear();
    tree_.string_arena_.clear();
    tree_.value_arena_.clear();
    tree_.source_arena_.clear();
    tree_.packet_key_ = packet_key;
    tree_.registry_revision_ = registry_->revision();
    tree_.condition_ = ParseCondition::Complete;
}

TreeResult<DataSourceId> ParsedPacketTreeBuilder::add_data_source(std::string_view name,
                                                                  std::span<const std::byte> bytes, DataSourceKind kind,
                                                                  std::span<const ParsedContributor> contributors) {
    if (finalized_) {
        return TreeBuildError{TreeBuildErrorCode::Finalized};
    }
    if (tree_.data_sources_.empty() && kind != DataSourceKind::Captured) {
        return TreeBuildError{TreeBuildErrorCode::InvalidFirstSource};
    }
    if (!tree_.data_sources_.empty() && kind != DataSourceKind::Derived) {
        return TreeBuildError{TreeBuildErrorCode::InvalidDataSourceKind};
    }
    if (!internal::is_valid_utf8(name)) {
        return TreeBuildError{TreeBuildErrorCode::InvalidUtf8};
    }
    for (const auto& contributor : contributors) {
        if (contributor.packet_key.capture_id.is_nil() || contributor.packet_key.packet_id == 0) {
            return TreeBuildError{TreeBuildErrorCode::InvalidPacketKey};
        }
        const std::uint64_t source_end = static_cast<std::uint64_t>(contributor.source_offset) +
                                         static_cast<std::uint64_t>(contributor.source_length);
        const std::uint64_t destination_end = static_cast<std::uint64_t>(contributor.destination_offset) +
                                              static_cast<std::uint64_t>(contributor.destination_length);
        if (source_end > std::numeric_limits<std::uint32_t>::max()) {
            return TreeBuildError{TreeBuildErrorCode::NumericOverflow};
        }
        if (destination_end > bytes.size()) {
            return TreeBuildError{TreeBuildErrorCode::InvalidRange, static_cast<std::size_t>(destination_end),
                                  bytes.size()};
        }
    }
    if (tree_.data_sources_.size() >= budget_.max_data_sources) {
        return budget_error(TreeBuildErrorCode::MaxDataSources, tree_.data_sources_.size() + 1,
                            budget_.max_data_sources);
    }
    std::size_t contributor_end = 0;
    if (!checked_add(tree_.contributors_.size(), contributors.size(), contributor_end)) {
        return TreeBuildError{TreeBuildErrorCode::NumericOverflow};
    }
    if (contributor_end > budget_.max_contributors) {
        return budget_error(TreeBuildErrorCode::MaxContributors, contributor_end, budget_.max_contributors);
    }
    std::size_t string_end = 0;
    std::size_t source_end = 0;
    if (!checked_add(tree_.string_arena_.size(), name.size(), string_end) ||
        !checked_add(tree_.source_arena_.size(), bytes.size(), source_end) || !fits_u32(tree_.data_sources_.size()) ||
        !fits_u32(tree_.contributors_.size()) || !fits_u32(contributors.size()) ||
        !fits_u32(tree_.string_arena_.size()) || !fits_u32(name.size()) || !fits_u32(tree_.source_arena_.size()) ||
        !fits_u32(bytes.size())) {
        return TreeBuildError{TreeBuildErrorCode::NumericOverflow};
    }
    if (string_end > budget_.max_string_bytes) {
        return budget_error(TreeBuildErrorCode::MaxStringBytes, string_end, budget_.max_string_bytes);
    }
    if (source_end > budget_.max_source_bytes) {
        return budget_error(TreeBuildErrorCode::MaxSourceBytes, source_end, budget_.max_source_bytes);
    }
    std::size_t encoded_end = encoded_bytes();
    if (contributors.size() > std::numeric_limits<std::size_t>::max() / sizeof(ParsedContributor)) {
        return TreeBuildError{TreeBuildErrorCode::NumericOverflow};
    }
    const std::size_t additions[] = {sizeof(ParsedDataSource), contributors.size() * sizeof(ParsedContributor),
                                     name.size(), bytes.size()};
    for (const std::size_t addition : additions) {
        if (!checked_add(encoded_end, addition, encoded_end)) {
            return TreeBuildError{TreeBuildErrorCode::NumericOverflow};
        }
    }
    if (encoded_end > budget_.max_encoded_bytes) {
        return budget_error(TreeBuildErrorCode::MaxEncodedBytes, encoded_end, budget_.max_encoded_bytes);
    }

    try {
        reserve_for_append(tree_.data_sources_, tree_.data_sources_.size() + 1, budget_.max_data_sources);
        reserve_for_append(tree_.contributors_, contributor_end, budget_.max_contributors);
        reserve_for_append(tree_.string_arena_, string_end, budget_.max_string_bytes);
        reserve_for_append(tree_.source_arena_, source_end, budget_.max_source_bytes);
    } catch (const std::bad_alloc&) {
        return TreeBuildError{TreeBuildErrorCode::AllocationFailed};
    }

    const DataSourceId id = static_cast<DataSourceId>(tree_.data_sources_.size());
    const ParsedDataSource source{id,
                                  kind,
                                  static_cast<std::uint32_t>(tree_.string_arena_.size()),
                                  static_cast<std::uint32_t>(name.size()),
                                  static_cast<std::uint32_t>(tree_.source_arena_.size()),
                                  static_cast<std::uint32_t>(bytes.size()),
                                  static_cast<std::uint32_t>(tree_.contributors_.size()),
                                  static_cast<std::uint32_t>(contributors.size())};
    tree_.string_arena_.insert(tree_.string_arena_.end(), name.begin(), name.end());
    tree_.source_arena_.insert(tree_.source_arena_.end(), bytes.begin(), bytes.end());
    tree_.contributors_.insert(tree_.contributors_.end(), contributors.begin(), contributors.end());
    tree_.data_sources_.push_back(source);
    return id;
}

TreeResult<std::uint32_t> ParsedPacketTreeBuilder::add_none(FieldId field_id, std::uint32_t parent_index,
                                                            DataSourceId data_source_id, std::size_t offset,
                                                            std::size_t length, std::uint32_t flags) {
    return add_node(field_id, FieldValueType::Protocol, ParsedValueTag::None, parent_index, data_source_id, offset,
                    length, 0, 0, {}, {}, flags);
}

TreeResult<std::uint32_t> ParsedPacketTreeBuilder::add_unsigned(FieldId field_id, std::uint32_t parent_index,
                                                                DataSourceId data_source_id, std::size_t offset,
                                                                std::size_t length, std::uint64_t value,
                                                                std::uint32_t flags) {
    return add_node(field_id, FieldValueType::Unsigned, ParsedValueTag::Unsigned, parent_index, data_source_id, offset,
                    length, value, 0, {}, {}, flags);
}

TreeResult<std::uint32_t> ParsedPacketTreeBuilder::add_signed(FieldId field_id, std::uint32_t parent_index,
                                                              DataSourceId data_source_id, std::size_t offset,
                                                              std::size_t length, std::int64_t value,
                                                              std::uint32_t flags) {
    return add_node(field_id, FieldValueType::Signed, ParsedValueTag::Signed, parent_index, data_source_id, offset,
                    length, std::bit_cast<std::uint64_t>(value), value < 0 ? UINT64_MAX : 0, {}, {}, flags);
}

TreeResult<std::uint32_t> ParsedPacketTreeBuilder::add_boolean(FieldId field_id, std::uint32_t parent_index,
                                                               DataSourceId data_source_id, std::size_t offset,
                                                               std::size_t length, bool value, std::uint32_t flags) {
    return add_node(field_id, FieldValueType::Boolean, ParsedValueTag::Boolean, parent_index, data_source_id, offset,
                    length, value ? 1 : 0, 0, {}, {}, flags);
}

TreeResult<std::uint32_t> ParsedPacketTreeBuilder::add_bytes(FieldId field_id, std::uint32_t parent_index,
                                                             DataSourceId data_source_id, std::size_t offset,
                                                             std::size_t length, std::span<const std::byte> value,
                                                             std::uint32_t flags) {
    return add_node(field_id, FieldValueType::Bytes, ParsedValueTag::Bytes, parent_index, data_source_id, offset,
                    length, 0, 0, value, {}, flags);
}

TreeResult<std::uint32_t> ParsedPacketTreeBuilder::add_source_bytes(FieldId field_id, std::uint32_t parent_index,
                                                                    DataSourceId data_source_id, std::size_t offset,
                                                                    std::size_t length) {
    return add_node(field_id, FieldValueType::Bytes, ParsedValueTag::Bytes, parent_index, data_source_id, offset,
                    length, 0, 0, {}, {}, ParsedNodeFlagSourceBacked);
}

TreeResult<std::uint32_t> ParsedPacketTreeBuilder::add_string(FieldId field_id, std::uint32_t parent_index,
                                                              DataSourceId data_source_id, std::size_t offset,
                                                              std::size_t length, std::string_view value,
                                                              std::uint32_t flags) {
    return add_node(field_id, FieldValueType::String, ParsedValueTag::String, parent_index, data_source_id, offset,
                    length, 0, 0, {}, value, flags);
}

TreeResult<std::uint32_t> ParsedPacketTreeBuilder::add_generated_text(FieldId field_id, std::uint32_t parent_index,
                                                                      DataSourceId data_source_id, std::size_t offset,
                                                                      std::size_t length, std::string_view value,
                                                                      std::uint32_t flags) {
    return add_node(field_id, FieldValueType::GeneratedText, ParsedValueTag::GeneratedText, parent_index,
                    data_source_id, offset, length, 0, 0, {}, value, flags | ParsedNodeFlagGenerated);
}

TreeResult<std::uint32_t> ParsedPacketTreeBuilder::add_generated_text(FieldId field_id, std::uint32_t parent_index,
                                                                      DataSourceId data_source_id,
                                                                      std::string_view value, std::uint32_t flags) {
    return add_generated_text(field_id, parent_index, data_source_id, 0, 0, value, flags);
}

TreeResult<std::monostate> ParsedPacketTreeBuilder::set_condition(ParseCondition condition) noexcept {
    if (finalized_) {
        return TreeBuildError{TreeBuildErrorCode::Finalized};
    }
    if (condition < ParseCondition::Complete || condition > ParseCondition::ResourceLimit) {
        return TreeBuildError{TreeBuildErrorCode::InvalidCondition};
    }
    if (tree_.condition_ != ParseCondition::ResourceLimit) {
        tree_.condition_ = condition;
    }
    return std::monostate{};
}

ParseCondition ParsedPacketTreeBuilder::condition() const noexcept { return tree_.condition_; }

std::span<const ParsedFieldNode> ParsedPacketTreeBuilder::nodes() const noexcept { return tree_.nodes_; }

std::span<const ParsedDataSource> ParsedPacketTreeBuilder::data_sources() const noexcept { return tree_.data_sources_; }

TreeResult<ParsedPacketTree> ParsedPacketTreeBuilder::finalize() {
    if (finalized_) {
        return TreeBuildError{TreeBuildErrorCode::Finalized};
    }
    if (tree_.data_sources_.empty() || tree_.nodes_.empty()) {
        return TreeBuildError{TreeBuildErrorCode::Empty};
    }
    if (tree_.packet_key_.capture_id.is_nil() || tree_.packet_key_.packet_id == 0) {
        return TreeBuildError{TreeBuildErrorCode::InvalidPacketKey};
    }
    finalized_ = true;
    return std::move(tree_);
}

TreeResult<std::uint32_t> ParsedPacketTreeBuilder::add_node(
    FieldId field_id, FieldValueType expected_type, ParsedValueTag value_tag, std::uint32_t parent_index,
    DataSourceId data_source_id, std::size_t offset, std::size_t length, std::uint64_t value_low,
    std::uint64_t value_high, std::span<const std::byte> byte_value, std::string_view text_value, std::uint32_t flags) {
    const auto validation = validate_node(field_id, expected_type, parent_index, data_source_id, offset, length,
                                          byte_value.size(), text_value.size(), flags);
    if (const auto* failure = std::get_if<TreeBuildError>(&validation)) {
        return *failure;
    }
    if (!text_value.empty() && !internal::is_valid_utf8(text_value)) {
        return TreeBuildError{TreeBuildErrorCode::InvalidUtf8};
    }

    try {
        reserve_for_append(tree_.nodes_, tree_.nodes_.size() + 1, budget_.max_nodes);
        reserve_for_append(tree_.value_arena_, tree_.value_arena_.size() + byte_value.size(), budget_.max_value_bytes);
        reserve_for_append(tree_.string_arena_, tree_.string_arena_.size() + text_value.size(),
                           budget_.max_string_bytes);
    } catch (const std::bad_alloc&) {
        return TreeBuildError{TreeBuildErrorCode::AllocationFailed};
    }

    std::uint32_t value_offset = 0;
    std::uint32_t value_length = 0;
    if (!byte_value.empty()) {
        value_offset = static_cast<std::uint32_t>(tree_.value_arena_.size());
        value_length = static_cast<std::uint32_t>(byte_value.size());
        tree_.value_arena_.insert(tree_.value_arena_.end(), byte_value.begin(), byte_value.end());
    } else if (!text_value.empty()) {
        value_offset = static_cast<std::uint32_t>(tree_.string_arena_.size());
        value_length = static_cast<std::uint32_t>(text_value.size());
        tree_.string_arena_.insert(tree_.string_arena_.end(), text_value.begin(), text_value.end());
    }
    const std::uint32_t index = static_cast<std::uint32_t>(tree_.nodes_.size());
    tree_.nodes_.push_back(ParsedFieldNode{field_id, parent_index, data_source_id, static_cast<std::uint32_t>(offset),
                                           static_cast<std::uint32_t>(length), flags, value_tag, value_low, value_high,
                                           value_offset, value_length});
    return index;
}

TreeResult<std::uint32_t> ParsedPacketTreeBuilder::validate_node(FieldId field_id, FieldValueType expected_type,
                                                                 std::uint32_t parent_index,
                                                                 DataSourceId data_source_id, std::size_t offset,
                                                                 std::size_t length, std::size_t value_bytes,
                                                                 std::size_t string_bytes, std::uint32_t flags) {
    if (finalized_) {
        return TreeBuildError{TreeBuildErrorCode::Finalized};
    }
    const auto field_result = registry_->field(field_id);
    const auto* field = std::get_if<std::reference_wrapper<const FieldDescriptor>>(&field_result);
    if (field == nullptr) {
        return TreeBuildError{TreeBuildErrorCode::UnknownField, field_id.value};
    }
    if (field->get().value_type != expected_type) {
        return TreeBuildError{TreeBuildErrorCode::ValueTypeMismatch};
    }
    constexpr auto known_flags = ParsedNodeFlagGenerated | ParsedNodeFlagSourceBacked;
    if ((flags & ~known_flags) != 0 ||
        ((flags & ParsedNodeFlagSourceBacked) != 0 && (expected_type != FieldValueType::Bytes || value_bytes != 0))) {
        return TreeBuildError{TreeBuildErrorCode::ValueTypeMismatch};
    }
    if (tree_.nodes_.empty()) {
        if (parent_index != kNoParentIndex || expected_type != FieldValueType::Protocol) {
            return TreeBuildError{TreeBuildErrorCode::InvalidRoot};
        }
    } else if (parent_index == kNoParentIndex || parent_index >= tree_.nodes_.size()) {
        return TreeBuildError{TreeBuildErrorCode::InvalidParent, parent_index};
    }
    if (data_source_id >= tree_.data_sources_.size()) {
        return TreeBuildError{TreeBuildErrorCode::InvalidDataSource, data_source_id};
    }
    std::size_t range_end = 0;
    if (!checked_add(offset, length, range_end) || !fits_u32(offset) || !fits_u32(length) ||
        !fits_u32(tree_.nodes_.size()) || !fits_u32(tree_.value_arena_.size()) || !fits_u32(value_bytes) ||
        !fits_u32(tree_.string_arena_.size()) || !fits_u32(string_bytes)) {
        return TreeBuildError{TreeBuildErrorCode::NumericOverflow};
    }
    const bool generated_zero_range = (flags & ParsedNodeFlagGenerated) != 0 && offset == 0 && length == 0;
    if (!generated_zero_range && range_end > tree_.data_sources_[data_source_id].source_length) {
        return TreeBuildError{TreeBuildErrorCode::InvalidRange, range_end,
                              tree_.data_sources_[data_source_id].source_length};
    }
    if (!tree_.nodes_.empty() && !generated_zero_range) {
        const auto& parent = tree_.nodes_[parent_index];
        if (parent.data_source_id == data_source_id) {
            const auto parent_end = static_cast<std::uint64_t>(parent.offset) + parent.length;
            if (offset < parent.offset || range_end > parent_end) {
                return TreeBuildError{TreeBuildErrorCode::InvalidRange, range_end,
                                      static_cast<std::size_t>(parent_end)};
            }
        }
    }
    if (tree_.nodes_.size() >= budget_.max_nodes) {
        return budget_error(TreeBuildErrorCode::MaxNodes, tree_.nodes_.size() + 1, budget_.max_nodes);
    }
    std::size_t depth = 1;
    for (std::uint32_t ancestor = parent_index; ancestor != kNoParentIndex;
         ancestor = tree_.nodes_[ancestor].parent_index) {
        ++depth;
    }
    if (depth > budget_.max_depth) {
        return budget_error(TreeBuildErrorCode::MaxDepth, depth, budget_.max_depth);
    }
    std::size_t value_end = 0;
    std::size_t string_end = 0;
    if (!checked_add(tree_.value_arena_.size(), value_bytes, value_end) ||
        !checked_add(tree_.string_arena_.size(), string_bytes, string_end)) {
        return TreeBuildError{TreeBuildErrorCode::NumericOverflow};
    }
    if (value_end > budget_.max_value_bytes) {
        return budget_error(TreeBuildErrorCode::MaxValueBytes, value_end, budget_.max_value_bytes);
    }
    if (string_end > budget_.max_string_bytes) {
        return budget_error(TreeBuildErrorCode::MaxStringBytes, string_end, budget_.max_string_bytes);
    }
    std::size_t encoded_end = encoded_bytes();
    if (!checked_add(encoded_end, sizeof(ParsedFieldNode), encoded_end) ||
        !checked_add(encoded_end, value_bytes, encoded_end) || !checked_add(encoded_end, string_bytes, encoded_end)) {
        return TreeBuildError{TreeBuildErrorCode::NumericOverflow};
    }
    if (encoded_end > budget_.max_encoded_bytes) {
        return budget_error(TreeBuildErrorCode::MaxEncodedBytes, encoded_end, budget_.max_encoded_bytes);
    }
    return static_cast<std::uint32_t>(tree_.nodes_.size());
}

TreeBuildError ParsedPacketTreeBuilder::budget_error(TreeBuildErrorCode code, std::size_t requested,
                                                     std::size_t limit) noexcept {
    tree_.condition_ = ParseCondition::ResourceLimit;
    return TreeBuildError{code, requested, limit};
}

std::size_t ParsedPacketTreeBuilder::encoded_bytes() const noexcept {
    std::size_t total = kParsedTreeEncodedOverhead;
    const auto add_product = [&](std::size_t count, std::size_t width) {
        if (count != 0 && width > std::numeric_limits<std::size_t>::max() / count) {
            total = std::numeric_limits<std::size_t>::max();
            return;
        }
        const auto bytes = count * width;
        if (bytes > std::numeric_limits<std::size_t>::max() - total) {
            total = std::numeric_limits<std::size_t>::max();
            return;
        }
        total += bytes;
    };
    add_product(tree_.nodes_.size(), sizeof(ParsedFieldNode));
    add_product(tree_.data_sources_.size(), sizeof(ParsedDataSource));
    add_product(tree_.contributors_.size(), sizeof(ParsedContributor));
    add_product(tree_.string_arena_.size(), 1);
    add_product(tree_.value_arena_.size(), 1);
    add_product(tree_.source_arena_.size(), 1);
    return total;
}

} // namespace pruftnet::parsing

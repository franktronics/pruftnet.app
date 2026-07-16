#pragma once

#include <cstddef>
#include <cstdint>
#include <span>
#include <string_view>
#include <variant>
#include <vector>

#include "pruftnet/parsing/parse_budget.hpp"
#include "pruftnet/parsing/registry.hpp"
#include "pruftnet/sniffing/packet.hpp"

namespace pruftnet::parsing {

using DataSourceId = std::uint32_t;
inline constexpr std::uint32_t kNoParentIndex = UINT32_MAX;
inline constexpr std::size_t kParsedTreeEncodedOverhead = 512;

enum class ParseCondition : std::uint8_t {
  Complete,
  Partial,
  Malformed,
  ResourceLimit,
};

enum class DataSourceKind : std::uint8_t {
  Captured,
  Derived,
};

enum class ParsedValueTag : std::uint8_t {
  None,
  Unsigned,
  Signed,
  Boolean,
  Bytes,
  String,
  GeneratedText,
};

enum ParsedNodeFlag : std::uint32_t {
  ParsedNodeFlagNone = 0,
  ParsedNodeFlagGenerated = 1U << 0U,
  ParsedNodeFlagSourceBacked = 1U << 1U,
};

struct ParsedFieldNode {
  FieldId field_id;
  std::uint32_t parent_index = kNoParentIndex;
  DataSourceId data_source_id = 0;
  std::uint32_t offset = 0;
  std::uint32_t length = 0;
  std::uint32_t flags = ParsedNodeFlagNone;
  ParsedValueTag value_tag = ParsedValueTag::None;
  std::uint64_t value_low = 0;
  std::uint64_t value_high = 0;
  std::uint32_t value_offset = 0;
  std::uint32_t value_length = 0;
};

struct ParsedContributor {
  sniffing::PacketKey packet_key;
  std::uint32_t source_offset = 0;
  std::uint32_t source_length = 0;
  std::uint32_t destination_offset = 0;
  std::uint32_t destination_length = 0;
};

struct ParsedDataSource {
  DataSourceId id = 0;
  DataSourceKind kind = DataSourceKind::Captured;
  std::uint32_t name_offset = 0;
  std::uint32_t name_length = 0;
  std::uint32_t source_offset = 0;
  std::uint32_t source_length = 0;
  std::uint32_t contributor_offset = 0;
  std::uint32_t contributor_count = 0;
};

enum class TreeBuildErrorCode {
  UnknownField,
  ValueTypeMismatch,
  InvalidParent,
  InvalidDataSource,
  InvalidRange,
  InvalidFirstSource,
  InvalidDataSourceKind,
  InvalidPacketKey,
  InvalidUtf8,
  InvalidCondition,
  InvalidRoot,
  NumericOverflow,
  MaxNodes,
  MaxDepth,
  MaxDataSources,
  MaxContributors,
  MaxStringBytes,
  MaxValueBytes,
  MaxSourceBytes,
  MaxEncodedBytes,
  AllocationFailed,
  Finalized,
  Empty,
};

struct TreeBuildError {
  TreeBuildErrorCode code;
  std::size_t requested = 0;
  std::size_t limit = 0;

  friend constexpr bool operator==(const TreeBuildError &,
                                   const TreeBuildError &) = default;
};

template <typename Value>
using TreeResult = std::variant<Value, TreeBuildError>;

class ParsedPacketTree {
public:
  [[nodiscard]] const sniffing::PacketKey &packet_key() const noexcept;
  [[nodiscard]] RegistryRevision registry_revision() const noexcept;
  [[nodiscard]] ParseCondition condition() const noexcept;
  [[nodiscard]] std::span<const ParsedFieldNode> nodes() const noexcept;
  [[nodiscard]] std::span<const ParsedDataSource> data_sources() const noexcept;
  [[nodiscard]] std::span<const ParsedContributor>
  contributors() const noexcept;
  [[nodiscard]] std::span<const char> string_arena() const noexcept;
  [[nodiscard]] std::span<const std::byte> value_arena() const noexcept;
  [[nodiscard]] std::span<const std::byte> source_arena() const noexcept;

  [[nodiscard]] std::string_view
  source_name(const ParsedDataSource &source) const noexcept;
  [[nodiscard]] std::span<const std::byte>
  source_bytes(const ParsedDataSource &source) const noexcept;
  [[nodiscard]] std::span<const ParsedContributor>
  source_contributors(const ParsedDataSource &source) const noexcept;
  [[nodiscard]] std::span<const std::byte>
  node_bytes(const ParsedFieldNode &node) const noexcept;
  [[nodiscard]] std::string_view
  node_text(const ParsedFieldNode &node) const noexcept;

private:
  friend class ParsedPacketTreeBuilder;

  sniffing::PacketKey packet_key_;
  RegistryRevision registry_revision_;
  ParseCondition condition_ = ParseCondition::Complete;
  std::vector<ParsedFieldNode> nodes_;
  std::vector<ParsedDataSource> data_sources_;
  std::vector<ParsedContributor> contributors_;
  std::vector<char> string_arena_;
  std::vector<std::byte> value_arena_;
  std::vector<std::byte> source_arena_;
};

class ParsedPacketTreeBuilder {
public:
  ParsedPacketTreeBuilder(RegistrySnapshotPtr registry,
                          sniffing::PacketKey packet_key,
                          ParseBudget budget = {});
  ParsedPacketTreeBuilder(RegistrySnapshotPtr registry,
                          sniffing::PacketKey packet_key,
                          ParsedPacketTree storage, ParseBudget budget = {});

  [[nodiscard]] TreeResult<DataSourceId>
  add_data_source(std::string_view name, std::span<const std::byte> bytes,
                  DataSourceKind kind,
                  std::span<const ParsedContributor> contributors = {});

  [[nodiscard]] TreeResult<std::uint32_t>
  add_none(FieldId field_id, std::uint32_t parent_index,
           DataSourceId data_source_id, std::size_t offset, std::size_t length,
           std::uint32_t flags = ParsedNodeFlagNone);
  [[nodiscard]] TreeResult<std::uint32_t>
  add_unsigned(FieldId field_id, std::uint32_t parent_index,
               DataSourceId data_source_id, std::size_t offset,
               std::size_t length, std::uint64_t value,
               std::uint32_t flags = ParsedNodeFlagNone);
  [[nodiscard]] TreeResult<std::uint32_t>
  add_signed(FieldId field_id, std::uint32_t parent_index,
             DataSourceId data_source_id, std::size_t offset,
             std::size_t length, std::int64_t value,
             std::uint32_t flags = ParsedNodeFlagNone);
  [[nodiscard]] TreeResult<std::uint32_t>
  add_boolean(FieldId field_id, std::uint32_t parent_index,
              DataSourceId data_source_id, std::size_t offset,
              std::size_t length, bool value,
              std::uint32_t flags = ParsedNodeFlagNone);
  [[nodiscard]] TreeResult<std::uint32_t>
  add_bytes(FieldId field_id, std::uint32_t parent_index,
            DataSourceId data_source_id, std::size_t offset, std::size_t length,
            std::span<const std::byte> value,
            std::uint32_t flags = ParsedNodeFlagNone);
  [[nodiscard]] TreeResult<std::uint32_t>
  add_source_bytes(FieldId field_id, std::uint32_t parent_index,
                   DataSourceId data_source_id, std::size_t offset,
                   std::size_t length);
  [[nodiscard]] TreeResult<std::uint32_t>
  add_string(FieldId field_id, std::uint32_t parent_index,
             DataSourceId data_source_id, std::size_t offset,
             std::size_t length, std::string_view value,
             std::uint32_t flags = ParsedNodeFlagNone);
  [[nodiscard]] TreeResult<std::uint32_t>
  add_generated_text(FieldId field_id, std::uint32_t parent_index,
                     DataSourceId data_source_id, std::size_t offset,
                     std::size_t length, std::string_view value,
                     std::uint32_t flags = ParsedNodeFlagNone);
  [[nodiscard]] TreeResult<std::uint32_t>
  add_generated_text(FieldId field_id, std::uint32_t parent_index,
                     DataSourceId data_source_id, std::string_view value,
                     std::uint32_t flags = ParsedNodeFlagNone);

  [[nodiscard]] TreeResult<std::monostate>
  set_condition(ParseCondition condition) noexcept;
  [[nodiscard]] ParseCondition condition() const noexcept;
  [[nodiscard]] std::span<const ParsedFieldNode> nodes() const noexcept;
  [[nodiscard]] std::span<const ParsedDataSource> data_sources() const noexcept;
  [[nodiscard]] std::span<const ParsedContributor>
  contributors() const noexcept;
  [[nodiscard]] std::span<const ParsedContributor>
  source_contributors(DataSourceId source) const noexcept;
  [[nodiscard]] TreeResult<ParsedPacketTree> finalize();

private:
  [[nodiscard]] TreeResult<std::uint32_t>
  add_node(FieldId field_id, FieldValueType expected_type,
           ParsedValueTag value_tag, std::uint32_t parent_index,
           DataSourceId data_source_id, std::size_t offset, std::size_t length,
           std::uint64_t value_low, std::uint64_t value_high,
           std::span<const std::byte> byte_value, std::string_view text_value,
           std::uint32_t flags);
  [[nodiscard]] TreeResult<std::uint32_t>
  validate_node(FieldId field_id, FieldValueType expected_type,
                std::uint32_t parent_index, DataSourceId data_source_id,
                std::size_t offset, std::size_t length, std::size_t value_bytes,
                std::size_t string_bytes, std::uint32_t flags);
  [[nodiscard]] TreeBuildError budget_error(TreeBuildErrorCode code,
                                            std::size_t requested,
                                            std::size_t limit) noexcept;
  [[nodiscard]] std::size_t encoded_bytes() const noexcept;

  RegistrySnapshotPtr registry_;
  ParseBudget budget_;
  ParsedPacketTree tree_;
  bool finalized_ = false;
};

} // namespace pruftnet::parsing

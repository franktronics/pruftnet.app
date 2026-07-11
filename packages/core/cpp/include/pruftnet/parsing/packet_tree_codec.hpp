#pragma once

#include <cstddef>
#include <cstdint>
#include <memory>
#include <span>
#include <string_view>
#include <variant>

#include "pruftnet/parsing/parsed_tree.hpp"

namespace pruftnet::parsing {

inline constexpr std::uint16_t kPacketTreeFormatVersion = 1;

enum class PacketTreeCodecErrorCode {
    MessageTooLarge,
    MalformedFlatBuffer,
    WrongFileIdentifier,
    UnsupportedVersion,
    WrongMessageKind,
    MissingPayload,
    RegistryRevisionMismatch,
    InvalidPacketKey,
    InvalidParseCondition,
    TooManyNodes,
    TooManyDataSources,
    TooManyContributors,
    StringArenaTooLarge,
    ValueArenaTooLarge,
    SourceArenaTooLarge,
    UnknownField,
    InvalidParent,
    MaxDepth,
    InvalidDataSource,
    InvalidRange,
    InvalidValue,
    InvalidUtf8,
    NumericOverflow,
    AllocationFailed,
};

struct PacketTreeCodecError {
    PacketTreeCodecErrorCode code;
    std::size_t index = 0;
    std::uint64_t expected = 0;
    std::uint64_t actual = 0;

    friend constexpr bool operator==(const PacketTreeCodecError&, const PacketTreeCodecError&) = default;
};

template <typename Value> using PacketTreeCodecResult = std::variant<Value, PacketTreeCodecError>;

class VerifiedPacketTreeView {
public:
    // The encoded storage must remain alive and immutable for this view's lifetime.
    [[nodiscard]] sniffing::PacketKey packet_key() const noexcept;
    [[nodiscard]] RegistryRevision registry_revision() const noexcept;
    [[nodiscard]] ParseCondition condition() const noexcept;
    [[nodiscard]] std::size_t node_count() const noexcept;
    [[nodiscard]] std::size_t data_source_count() const noexcept;
    [[nodiscard]] std::size_t contributor_count() const noexcept;
    [[nodiscard]] PacketTreeCodecResult<ParsedFieldNode> node(std::size_t index) const noexcept;
    [[nodiscard]] PacketTreeCodecResult<ParsedDataSource> data_source(std::size_t index) const noexcept;
    [[nodiscard]] PacketTreeCodecResult<ParsedContributor> contributor(std::size_t index) const noexcept;
    [[nodiscard]] std::span<const std::byte> string_arena() const noexcept;
    [[nodiscard]] std::span<const std::byte> value_arena() const noexcept;
    [[nodiscard]] std::span<const std::byte> source_arena() const noexcept;
    [[nodiscard]] std::string_view source_name(std::size_t index) const noexcept;
    [[nodiscard]] std::span<const std::byte> source_bytes(std::size_t index) const noexcept;
    [[nodiscard]] std::uint64_t checksum() const noexcept;

private:
    friend PacketTreeCodecResult<VerifiedPacketTreeView>
    verify_packet_tree(std::span<const std::byte>, const RegistrySnapshot&, const ParseBudget&) noexcept;

    explicit VerifiedPacketTreeView(std::span<const std::byte> bytes) noexcept;

    std::span<const std::byte> bytes_;
};

class PacketTreeEncoder {
public:
    PacketTreeEncoder();
    ~PacketTreeEncoder();
    PacketTreeEncoder(PacketTreeEncoder&&) noexcept;
    PacketTreeEncoder& operator=(PacketTreeEncoder&&) noexcept;
    PacketTreeEncoder(const PacketTreeEncoder&) = delete;
    PacketTreeEncoder& operator=(const PacketTreeEncoder&) = delete;

    // The returned span is valid until this encoder is destroyed or encode is called again.
    [[nodiscard]] PacketTreeCodecResult<std::span<const std::byte>> encode(const ParsedPacketTree& tree,
                                                                           const ParseBudget& budget = {});

private:
    class Impl;
    std::unique_ptr<Impl> impl_;
};

[[nodiscard]] PacketTreeCodecResult<VerifiedPacketTreeView> verify_packet_tree(std::span<const std::byte> bytes,
                                                                               const RegistrySnapshot& registry,
                                                                               const ParseBudget& budget = {}) noexcept;

} // namespace pruftnet::parsing

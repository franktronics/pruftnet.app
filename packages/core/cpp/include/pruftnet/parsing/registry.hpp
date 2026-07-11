#pragma once

#include <cstdint>
#include <functional>
#include <memory>
#include <span>
#include <string>
#include <string_view>
#include <unordered_map>
#include <variant>
#include <vector>

namespace pruftnet::parsing {

struct ProtocolId {
    std::uint32_t value = 0;

    [[nodiscard]] constexpr bool is_valid() const noexcept { return value != 0; }
    friend constexpr bool operator==(const ProtocolId&, const ProtocolId&) = default;
};

struct FieldId {
    std::uint32_t value = 0;

    [[nodiscard]] constexpr bool is_valid() const noexcept { return value != 0; }
    friend constexpr bool operator==(const FieldId&, const FieldId&) = default;
};

struct RegistryRevision {
    std::uint64_t value = 0;

    [[nodiscard]] constexpr bool is_valid() const noexcept { return value != 0; }
    friend constexpr bool operator==(const RegistryRevision&, const RegistryRevision&) = default;
};

enum class FieldValueType : std::uint8_t {
    Protocol,
    Unsigned,
    Signed,
    Boolean,
    Bytes,
    String,
    GeneratedText,
};

enum DescriptorVisibilityFlag : std::uint32_t {
    DescriptorVisibilityNone = 0,
    DescriptorVisibilityVisible = 1U << 0U,
    DescriptorVisibilityFilterable = 1U << 1U,
    DescriptorVisibilityLuaVisible = 1U << 2U,
};

inline constexpr std::uint32_t kDefaultDescriptorVisibility =
    DescriptorVisibilityVisible | DescriptorVisibilityFilterable | DescriptorVisibilityLuaVisible;

struct ProtocolDescriptor {
    ProtocolId id;
    std::string key;
    std::string display_name;
    std::uint32_t visibility_flags = kDefaultDescriptorVisibility;
};

struct FieldDescriptor {
    FieldId id;
    ProtocolId protocol_id;
    std::string key;
    std::string display_name;
    FieldValueType value_type = FieldValueType::Protocol;
    std::uint32_t visibility_flags = kDefaultDescriptorVisibility;
};

enum class RegistryErrorCode {
    InvalidKey,
    InvalidUtf8,
    InvalidValueType,
    DuplicateKey,
    UnknownProtocol,
    UnknownField,
    CapacityExceeded,
    AllocationFailed,
    Frozen,
    Empty,
};

struct RegistryError {
    RegistryErrorCode code;
    std::string key;
    std::uint64_t id = 0;

    friend bool operator==(const RegistryError&, const RegistryError&) = default;
};

template <typename Value> using RegistryResult = std::variant<Value, RegistryError>;

class RegistrySnapshot {
public:
    [[nodiscard]] RegistryRevision revision() const noexcept;
    [[nodiscard]] std::span<const ProtocolDescriptor> protocols() const noexcept;
    [[nodiscard]] std::span<const FieldDescriptor> fields() const noexcept;
    [[nodiscard]] RegistryResult<std::reference_wrapper<const ProtocolDescriptor>> protocol(ProtocolId id) const;
    [[nodiscard]] RegistryResult<std::reference_wrapper<const ProtocolDescriptor>> protocol(std::string_view key) const;
    [[nodiscard]] RegistryResult<std::reference_wrapper<const FieldDescriptor>> field(FieldId id) const;
    [[nodiscard]] RegistryResult<std::reference_wrapper<const FieldDescriptor>> field(std::string_view key) const;

private:
    friend class RegistryBuilder;

    RegistrySnapshot(std::vector<ProtocolDescriptor> protocols, std::vector<FieldDescriptor> fields,
                     RegistryRevision revision);

    std::vector<ProtocolDescriptor> protocols_;
    std::vector<FieldDescriptor> fields_;
    std::unordered_map<std::string, std::uint32_t> protocol_keys_;
    std::unordered_map<std::string, std::uint32_t> field_keys_;
    RegistryRevision revision_;
};

class RegistryBuilder {
public:
    [[nodiscard]] RegistryResult<ProtocolId>
    register_protocol(std::string key, std::string display_name,
                      std::uint32_t visibility_flags = kDefaultDescriptorVisibility);
    [[nodiscard]] RegistryResult<FieldId> register_field(ProtocolId protocol_id, std::string key,
                                                         std::string display_name, FieldValueType value_type,
                                                         std::uint32_t visibility_flags = kDefaultDescriptorVisibility);
    [[nodiscard]] RegistryResult<RegistrySnapshot> freeze();

private:
    std::vector<ProtocolDescriptor> protocols_;
    std::vector<FieldDescriptor> fields_;
    std::unordered_map<std::string, std::uint32_t> protocol_keys_;
    std::unordered_map<std::string, std::uint32_t> field_keys_;
    bool frozen_ = false;
};

using RegistrySnapshotPtr = std::shared_ptr<const RegistrySnapshot>;

[[nodiscard]] RegistryResult<RegistrySnapshot> make_core_registry();

} // namespace pruftnet::parsing

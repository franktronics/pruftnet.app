#include "pruftnet/parsing/registry.hpp"

#include <cstddef>
#include <limits>
#include <new>
#include <utility>

#include "parsing/utf8.hpp"

namespace pruftnet::parsing {
namespace {

constexpr std::uint64_t kFnvOffsetBasis = 14695981039346656037ULL;
constexpr std::uint64_t kFnvPrime = 1099511628211ULL;

bool is_valid_key(std::string_view key) noexcept {
    if (key.empty() || key.front() == '.' || key.back() == '.') {
        return false;
    }
    bool segment_start = true;
    for (const char character : key) {
        if (character == '.') {
            if (segment_start) {
                return false;
            }
            segment_start = true;
            continue;
        }
        const bool letter = character >= 'a' && character <= 'z';
        const bool digit = character >= '0' && character <= '9';
        if ((!letter && !digit && character != '_') || (segment_start && digit)) {
            return false;
        }
        segment_start = false;
    }
    return !segment_start;
}

void hash_byte(std::uint64_t& hash, std::uint8_t value) noexcept {
    hash ^= value;
    hash *= kFnvPrime;
}

template <typename Integer> void hash_integer(std::uint64_t& hash, Integer value) noexcept {
    for (std::size_t index = 0; index < sizeof(Integer); ++index) {
        hash_byte(hash, static_cast<std::uint8_t>(value & static_cast<Integer>(0xFFU)));
        value >>= 8U;
    }
}

void hash_string(std::uint64_t& hash, std::string_view value) noexcept {
    hash_integer(hash, static_cast<std::uint64_t>(value.size()));
    for (const unsigned char character : value) {
        hash_byte(hash, character);
    }
}

RegistryRevision compute_revision(std::span<const ProtocolDescriptor> protocols,
                                  std::span<const FieldDescriptor> fields) noexcept {
    std::uint64_t hash = kFnvOffsetBasis;
    hash_integer(hash, static_cast<std::uint64_t>(protocols.size()));
    for (const auto& protocol : protocols) {
        hash_byte(hash, 1);
        hash_integer(hash, protocol.id.value);
        hash_string(hash, protocol.key);
        hash_string(hash, protocol.display_name);
        hash_integer(hash, protocol.visibility_flags);
    }
    hash_integer(hash, static_cast<std::uint64_t>(fields.size()));
    for (const auto& field : fields) {
        hash_byte(hash, 2);
        hash_integer(hash, field.id.value);
        hash_integer(hash, field.protocol_id.value);
        hash_string(hash, field.key);
        hash_string(hash, field.display_name);
        hash_byte(hash, static_cast<std::uint8_t>(field.value_type));
        hash_integer(hash, field.visibility_flags);
    }
    return RegistryRevision{hash == 0 ? 1 : hash};
}

RegistryError error(RegistryErrorCode code, std::string_view key = {}, std::uint64_t id = 0) {
    return RegistryError{code, std::string(key), id};
}

} // namespace

RegistrySnapshot::RegistrySnapshot(std::vector<ProtocolDescriptor> protocols, std::vector<FieldDescriptor> fields,
                                   RegistryRevision revision)
    : protocols_(std::move(protocols)), fields_(std::move(fields)), revision_(revision) {
    protocol_keys_.reserve(protocols_.size());
    for (const auto& descriptor : protocols_) {
        protocol_keys_.emplace(descriptor.key, descriptor.id.value);
    }
    field_keys_.reserve(fields_.size());
    for (const auto& descriptor : fields_) {
        field_keys_.emplace(descriptor.key, descriptor.id.value);
    }
}

RegistryRevision RegistrySnapshot::revision() const noexcept { return revision_; }

std::span<const ProtocolDescriptor> RegistrySnapshot::protocols() const noexcept { return protocols_; }

std::span<const FieldDescriptor> RegistrySnapshot::fields() const noexcept { return fields_; }

RegistryResult<std::reference_wrapper<const ProtocolDescriptor>> RegistrySnapshot::protocol(ProtocolId id) const {
    if (!id.is_valid() || id.value > protocols_.size()) {
        return error(RegistryErrorCode::UnknownProtocol, {}, id.value);
    }
    return std::cref(protocols_[id.value - 1]);
}

RegistryResult<std::reference_wrapper<const ProtocolDescriptor>>
RegistrySnapshot::protocol(std::string_view key) const {
    const auto found = protocol_keys_.find(std::string(key));
    if (found == protocol_keys_.end()) {
        return error(RegistryErrorCode::UnknownProtocol, key);
    }
    return std::cref(protocols_[found->second - 1]);
}

RegistryResult<std::reference_wrapper<const FieldDescriptor>> RegistrySnapshot::field(FieldId id) const {
    if (!id.is_valid() || id.value > fields_.size()) {
        return error(RegistryErrorCode::UnknownField, {}, id.value);
    }
    return std::cref(fields_[id.value - 1]);
}

RegistryResult<std::reference_wrapper<const FieldDescriptor>> RegistrySnapshot::field(std::string_view key) const {
    const auto found = field_keys_.find(std::string(key));
    if (found == field_keys_.end()) {
        return error(RegistryErrorCode::UnknownField, key);
    }
    return std::cref(fields_[found->second - 1]);
}

RegistryResult<ProtocolId> RegistryBuilder::register_protocol(std::string key, std::string display_name,
                                                              std::uint32_t visibility_flags) {
    if (frozen_) {
        return error(RegistryErrorCode::Frozen, key);
    }
    if (!is_valid_key(key)) {
        return error(RegistryErrorCode::InvalidKey, key);
    }
    if (!internal::is_valid_utf8(display_name)) {
        return error(RegistryErrorCode::InvalidUtf8, key);
    }
    if (protocol_keys_.contains(key)) {
        return error(RegistryErrorCode::DuplicateKey, key);
    }
    if (protocols_.size() >= std::numeric_limits<std::uint32_t>::max()) {
        return error(RegistryErrorCode::CapacityExceeded, key);
    }
    const ProtocolId id{static_cast<std::uint32_t>(protocols_.size() + 1)};
    try {
        protocols_.reserve(protocols_.size() + 1);
        protocol_keys_.reserve(protocol_keys_.size() + 1);
        protocol_keys_.emplace(key, id.value);
        protocols_.push_back(ProtocolDescriptor{id, std::move(key), std::move(display_name), visibility_flags});
    } catch (const std::bad_alloc&) {
        return RegistryError{RegistryErrorCode::AllocationFailed, {}, 0};
    }
    return id;
}

RegistryResult<FieldId> RegistryBuilder::register_field(ProtocolId protocol_id, std::string key,
                                                        std::string display_name, FieldValueType value_type,
                                                        std::uint32_t visibility_flags) {
    if (frozen_) {
        return error(RegistryErrorCode::Frozen, key);
    }
    if (!is_valid_key(key)) {
        return error(RegistryErrorCode::InvalidKey, key);
    }
    if (!internal::is_valid_utf8(display_name)) {
        return error(RegistryErrorCode::InvalidUtf8, key);
    }
    if (value_type < FieldValueType::Protocol || value_type > FieldValueType::GeneratedText) {
        return error(RegistryErrorCode::InvalidValueType, key);
    }
    if (field_keys_.contains(key)) {
        return error(RegistryErrorCode::DuplicateKey, key);
    }
    if (!protocol_id.is_valid() || protocol_id.value > protocols_.size()) {
        return error(RegistryErrorCode::UnknownProtocol, {}, protocol_id.value);
    }
    if (fields_.size() >= std::numeric_limits<std::uint32_t>::max()) {
        return error(RegistryErrorCode::CapacityExceeded, key);
    }
    const FieldId id{static_cast<std::uint32_t>(fields_.size() + 1)};
    try {
        fields_.reserve(fields_.size() + 1);
        field_keys_.reserve(field_keys_.size() + 1);
        field_keys_.emplace(key, id.value);
        fields_.push_back(
            FieldDescriptor{id, protocol_id, std::move(key), std::move(display_name), value_type, visibility_flags});
    } catch (const std::bad_alloc&) {
        return RegistryError{RegistryErrorCode::AllocationFailed, {}, 0};
    }
    return id;
}

RegistryResult<RegistrySnapshot> RegistryBuilder::freeze() {
    if (frozen_) {
        return error(RegistryErrorCode::Frozen);
    }
    if (protocols_.empty()) {
        return error(RegistryErrorCode::Empty);
    }
    const RegistryRevision revision = compute_revision(protocols_, fields_);
    try {
        RegistrySnapshot snapshot(protocols_, fields_, revision);
        frozen_ = true;
        return snapshot;
    } catch (const std::bad_alloc&) {
        return RegistryError{RegistryErrorCode::AllocationFailed, {}, 0};
    }
}

RegistryResult<RegistrySnapshot> make_core_registry() {
    RegistryBuilder builder;
    const auto root_result = builder.register_protocol("root", "Root");
    if (const auto* failure = std::get_if<RegistryError>(&root_result)) {
        return *failure;
    }
    const auto unknown_result = builder.register_protocol("unknown", "Unknown");
    if (const auto* failure = std::get_if<RegistryError>(&unknown_result)) {
        return *failure;
    }
    const auto diagnostics_result = builder.register_protocol("diagnostics", "Diagnostics");
    if (const auto* failure = std::get_if<RegistryError>(&diagnostics_result)) {
        return *failure;
    }

    const auto frame =
        builder.register_field(std::get<ProtocolId>(root_result), "root.frame", "Frame", FieldValueType::Protocol);
    const auto data = builder.register_field(std::get<ProtocolId>(unknown_result), "unknown.data", "Unknown data",
                                             FieldValueType::Bytes);
    const auto diagnostic = builder.register_field(std::get<ProtocolId>(diagnostics_result), "diagnostics.message",
                                                   "Diagnostic", FieldValueType::GeneratedText);
    if (const auto* failure = std::get_if<RegistryError>(&frame)) {
        return *failure;
    }
    if (const auto* failure = std::get_if<RegistryError>(&data)) {
        return *failure;
    }
    if (const auto* failure = std::get_if<RegistryError>(&diagnostic)) {
        return *failure;
    }
    return builder.freeze();
}

} // namespace pruftnet::parsing

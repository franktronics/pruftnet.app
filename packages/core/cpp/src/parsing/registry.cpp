#include "pruftnet/parsing/registry.hpp"

#include <array>
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

    struct ProtocolDefinition {
        std::string_view key;
        std::string_view display_name;
    };
    constexpr std::array protocols{
        ProtocolDefinition{"root", "Root"},
        ProtocolDefinition{"unknown", "Unknown"},
        ProtocolDefinition{"diagnostics", "Diagnostics"},
        ProtocolDefinition{"eth", "Ethernet"},
        ProtocolDefinition{"ipv4", "Internet Protocol Version 4"},
        ProtocolDefinition{"udp", "User Datagram Protocol"},
        ProtocolDefinition{"vlan", "IEEE 802.1Q Virtual LAN"},
        ProtocolDefinition{"tcp", "Transmission Control Protocol"},
        ProtocolDefinition{"arp", "Address Resolution Protocol"},
        ProtocolDefinition{"ipv6", "Internet Protocol Version 6"},
        ProtocolDefinition{"icmp", "Internet Control Message Protocol"},
        ProtocolDefinition{"icmpv6", "Internet Control Message Protocol Version 6"},
    };
    std::array<ProtocolId, protocols.size()> protocol_ids{};
    for (std::size_t index = 0; index < protocols.size(); ++index) {
        auto result =
            builder.register_protocol(std::string(protocols[index].key), std::string(protocols[index].display_name));
        if (const auto* failure = std::get_if<RegistryError>(&result)) {
            return *failure;
        }
        protocol_ids[index] = std::get<ProtocolId>(result);
    }

    struct FieldDefinition {
        std::size_t protocol_index;
        std::string_view key;
        std::string_view display_name;
        FieldValueType value_type;
    };
    constexpr std::array fields{
        FieldDefinition{0, "root.frame", "Frame", FieldValueType::Protocol},
        FieldDefinition{1, "unknown.data", "Unknown data", FieldValueType::Bytes},
        FieldDefinition{2, "diagnostics.message", "Diagnostic", FieldValueType::GeneratedText},
        FieldDefinition{0, "root.captured_length", "Captured length", FieldValueType::Unsigned},
        FieldDefinition{0, "root.reported_length", "Reported length", FieldValueType::Unsigned},
        FieldDefinition{0, "root.link_type", "Link type", FieldValueType::Unsigned},
        FieldDefinition{3, "eth.frame", "Ethernet frame", FieldValueType::Protocol},
        FieldDefinition{3, "eth.destination", "Destination", FieldValueType::Bytes},
        FieldDefinition{3, "eth.source", "Source", FieldValueType::Bytes},
        FieldDefinition{3, "eth.type", "Type/Length", FieldValueType::Unsigned},
        FieldDefinition{4, "ipv4.packet", "Internet Protocol Version 4", FieldValueType::Protocol},
        FieldDefinition{4, "ipv4.version", "Version", FieldValueType::Unsigned},
        FieldDefinition{4, "ipv4.header_length", "Header length", FieldValueType::Unsigned},
        FieldDefinition{4, "ipv4.dscp_ecn", "DSCP/ECN", FieldValueType::Unsigned},
        FieldDefinition{4, "ipv4.total_length", "Total length", FieldValueType::Unsigned},
        FieldDefinition{4, "ipv4.identification", "Identification", FieldValueType::Unsigned},
        FieldDefinition{4, "ipv4.flags", "Flags", FieldValueType::Unsigned},
        FieldDefinition{4, "ipv4.fragment_offset", "Fragment offset", FieldValueType::Unsigned},
        FieldDefinition{4, "ipv4.ttl", "Time to live", FieldValueType::Unsigned},
        FieldDefinition{4, "ipv4.protocol", "Protocol", FieldValueType::Unsigned},
        FieldDefinition{4, "ipv4.checksum", "Header checksum", FieldValueType::Unsigned},
        FieldDefinition{4, "ipv4.source", "Source", FieldValueType::Bytes},
        FieldDefinition{4, "ipv4.destination", "Destination", FieldValueType::Bytes},
        FieldDefinition{4, "ipv4.options", "Options", FieldValueType::Bytes},
        FieldDefinition{5, "udp.datagram", "User Datagram Protocol", FieldValueType::Protocol},
        FieldDefinition{5, "udp.source_port", "Source port", FieldValueType::Unsigned},
        FieldDefinition{5, "udp.destination_port", "Destination port", FieldValueType::Unsigned},
        FieldDefinition{5, "udp.length", "Length", FieldValueType::Unsigned},
        FieldDefinition{5, "udp.checksum", "Checksum", FieldValueType::Unsigned},
        FieldDefinition{5, "udp.payload", "Payload", FieldValueType::Bytes},
        FieldDefinition{6, "vlan.tag", "IEEE 802.1Q tag", FieldValueType::Protocol},
        FieldDefinition{6, "vlan.priority", "Priority code point", FieldValueType::Unsigned},
        FieldDefinition{6, "vlan.dei", "Drop eligible indicator", FieldValueType::Unsigned},
        FieldDefinition{6, "vlan.id", "VLAN identifier", FieldValueType::Unsigned},
        FieldDefinition{6, "vlan.type", "Encapsulated type", FieldValueType::Unsigned},
        FieldDefinition{7, "tcp.segment", "Transmission Control Protocol", FieldValueType::Protocol},
        FieldDefinition{7, "tcp.source_port", "Source port", FieldValueType::Unsigned},
        FieldDefinition{7, "tcp.destination_port", "Destination port", FieldValueType::Unsigned},
        FieldDefinition{7, "tcp.sequence_number", "Sequence number", FieldValueType::Unsigned},
        FieldDefinition{7, "tcp.acknowledgment_number", "Acknowledgment number", FieldValueType::Unsigned},
        FieldDefinition{7, "tcp.header_length", "Header length", FieldValueType::Unsigned},
        FieldDefinition{7, "tcp.reserved", "Reserved bits", FieldValueType::Unsigned},
        FieldDefinition{7, "tcp.flags", "Flags", FieldValueType::Unsigned},
        FieldDefinition{7, "tcp.window", "Window size", FieldValueType::Unsigned},
        FieldDefinition{7, "tcp.checksum", "Checksum", FieldValueType::Unsigned},
        FieldDefinition{7, "tcp.urgent_pointer", "Urgent pointer", FieldValueType::Unsigned},
        FieldDefinition{7, "tcp.options", "Options", FieldValueType::Bytes},
        FieldDefinition{7, "tcp.payload", "Payload", FieldValueType::Bytes},
        FieldDefinition{8, "arp.packet", "Address Resolution Protocol", FieldValueType::Protocol},
        FieldDefinition{8, "arp.hardware_type", "Hardware type", FieldValueType::Unsigned},
        FieldDefinition{8, "arp.protocol_type", "Protocol type", FieldValueType::Unsigned},
        FieldDefinition{8, "arp.hardware_length", "Hardware address length", FieldValueType::Unsigned},
        FieldDefinition{8, "arp.protocol_length", "Protocol address length", FieldValueType::Unsigned},
        FieldDefinition{8, "arp.operation", "Operation", FieldValueType::Unsigned},
        FieldDefinition{8, "arp.sender_hardware", "Sender hardware address", FieldValueType::Bytes},
        FieldDefinition{8, "arp.sender_protocol", "Sender protocol address", FieldValueType::Bytes},
        FieldDefinition{8, "arp.target_hardware", "Target hardware address", FieldValueType::Bytes},
        FieldDefinition{8, "arp.target_protocol", "Target protocol address", FieldValueType::Bytes},
        FieldDefinition{9, "ipv6.packet", "Internet Protocol Version 6", FieldValueType::Protocol},
        FieldDefinition{9, "ipv6.version", "Version", FieldValueType::Unsigned},
        FieldDefinition{9, "ipv6.traffic_class", "Traffic class", FieldValueType::Unsigned},
        FieldDefinition{9, "ipv6.flow_label", "Flow label", FieldValueType::Unsigned},
        FieldDefinition{9, "ipv6.payload_length", "Payload length", FieldValueType::Unsigned},
        FieldDefinition{9, "ipv6.next_header", "Next header", FieldValueType::Unsigned},
        FieldDefinition{9, "ipv6.hop_limit", "Hop limit", FieldValueType::Unsigned},
        FieldDefinition{9, "ipv6.source", "Source", FieldValueType::Bytes},
        FieldDefinition{9, "ipv6.destination", "Destination", FieldValueType::Bytes},
        FieldDefinition{9, "ipv6.extension", "Extension header", FieldValueType::Protocol},
        FieldDefinition{9, "ipv6.extension_next_header", "Next header", FieldValueType::Unsigned},
        FieldDefinition{9, "ipv6.extension_length", "Extension length", FieldValueType::Unsigned},
        FieldDefinition{9, "ipv6.extension_type", "Extension type", FieldValueType::Unsigned},
        FieldDefinition{9, "ipv6.extension_data", "Extension data", FieldValueType::Bytes},
        FieldDefinition{9, "ipv6.fragment_offset_encoded", "Encoded fragment offset", FieldValueType::Unsigned},
        FieldDefinition{9, "ipv6.fragment_offset", "Fragment offset", FieldValueType::Unsigned},
        FieldDefinition{9, "ipv6.fragment_reserved", "Fragment reserved bits", FieldValueType::Unsigned},
        FieldDefinition{9, "ipv6.fragment_more", "More fragments", FieldValueType::Unsigned},
        FieldDefinition{9, "ipv6.fragment_identification", "Fragment identification", FieldValueType::Unsigned},
        FieldDefinition{10, "icmp.message", "Internet Control Message Protocol", FieldValueType::Protocol},
        FieldDefinition{10, "icmp.type", "Type", FieldValueType::Unsigned},
        FieldDefinition{10, "icmp.code", "Code", FieldValueType::Unsigned},
        FieldDefinition{10, "icmp.checksum", "Checksum", FieldValueType::Unsigned},
        FieldDefinition{10, "icmp.identifier", "Identifier", FieldValueType::Unsigned},
        FieldDefinition{10, "icmp.sequence", "Sequence number", FieldValueType::Unsigned},
        FieldDefinition{10, "icmp.gateway", "Gateway", FieldValueType::Bytes},
        FieldDefinition{10, "icmp.pointer", "Pointer", FieldValueType::Unsigned},
        FieldDefinition{10, "icmp.mtu", "Next-Hop MTU", FieldValueType::Unsigned},
        FieldDefinition{10, "icmp.body", "Message body", FieldValueType::Bytes},
        FieldDefinition{10, "icmp.quoted", "Quoted packet", FieldValueType::Bytes},
        FieldDefinition{11, "icmpv6.message", "Internet Control Message Protocol Version 6", FieldValueType::Protocol},
        FieldDefinition{11, "icmpv6.type", "Type", FieldValueType::Unsigned},
        FieldDefinition{11, "icmpv6.code", "Code", FieldValueType::Unsigned},
        FieldDefinition{11, "icmpv6.checksum", "Checksum", FieldValueType::Unsigned},
        FieldDefinition{11, "icmpv6.informational", "Informational message", FieldValueType::Unsigned},
        FieldDefinition{11, "icmpv6.identifier", "Identifier", FieldValueType::Unsigned},
        FieldDefinition{11, "icmpv6.sequence", "Sequence number", FieldValueType::Unsigned},
        FieldDefinition{11, "icmpv6.mtu", "MTU", FieldValueType::Unsigned},
        FieldDefinition{11, "icmpv6.pointer", "Pointer", FieldValueType::Unsigned},
        FieldDefinition{11, "icmpv6.target", "Target address", FieldValueType::Bytes},
        FieldDefinition{11, "icmpv6.destination", "Destination address", FieldValueType::Bytes},
        FieldDefinition{11, "icmpv6.flags", "Flags", FieldValueType::Unsigned},
        FieldDefinition{11, "icmpv6.current_hop_limit", "Current hop limit", FieldValueType::Unsigned},
        FieldDefinition{11, "icmpv6.router_lifetime", "Router lifetime", FieldValueType::Unsigned},
        FieldDefinition{11, "icmpv6.reachable_time", "Reachable time", FieldValueType::Unsigned},
        FieldDefinition{11, "icmpv6.retrans_timer", "Retransmission timer", FieldValueType::Unsigned},
        FieldDefinition{11, "icmpv6.body", "Message body", FieldValueType::Bytes},
        FieldDefinition{11, "icmpv6.quoted", "Quoted packet", FieldValueType::Bytes},
        FieldDefinition{11, "icmpv6.option", "Neighbor Discovery option", FieldValueType::Protocol},
        FieldDefinition{11, "icmpv6.option_type", "Option type", FieldValueType::Unsigned},
        FieldDefinition{11, "icmpv6.option_length", "Option length", FieldValueType::Unsigned},
        FieldDefinition{11, "icmpv6.option_body", "Option body", FieldValueType::Bytes},
        FieldDefinition{11, "icmpv6.redirected_packet", "Redirected packet", FieldValueType::Bytes},
        FieldDefinition{11, "icmpv6.link_layer_address", "Link-layer address", FieldValueType::Bytes},
        FieldDefinition{11, "icmpv6.prefix_length", "Prefix length", FieldValueType::Unsigned},
        FieldDefinition{11, "icmpv6.prefix_flags", "Prefix flags", FieldValueType::Unsigned},
        FieldDefinition{11, "icmpv6.valid_lifetime", "Valid lifetime", FieldValueType::Unsigned},
        FieldDefinition{11, "icmpv6.preferred_lifetime", "Preferred lifetime", FieldValueType::Unsigned},
        FieldDefinition{11, "icmpv6.prefix", "Prefix", FieldValueType::Bytes},
    };
    for (const auto& field : fields) {
        auto result = builder.register_field(protocol_ids[field.protocol_index], std::string(field.key),
                                             std::string(field.display_name), field.value_type);
        if (const auto* failure = std::get_if<RegistryError>(&result)) {
            return *failure;
        }
    }
    return builder.freeze();
}

} // namespace pruftnet::parsing

#include "parsing/packet_parser.hpp"

#include <algorithm>
#include <limits>
#include <optional>
#include <stdexcept>
#include <string_view>
#include <utility>
#include <variant>

#include "pruftnet/parsing/packet_view.hpp"

namespace pruftnet::parsing::internal {

struct PacketParser::FieldIds {
    FieldId root_frame;
    FieldId root_captured_length;
    FieldId root_reported_length;
    FieldId root_link_type;
    FieldId unknown_data;
    FieldId ethernet_frame;
    FieldId ethernet_destination;
    FieldId ethernet_source;
    FieldId ethernet_type;
    FieldId ipv4_packet;
    FieldId ipv4_version;
    FieldId ipv4_header_length;
    FieldId ipv4_dscp_ecn;
    FieldId ipv4_total_length;
    FieldId ipv4_identification;
    FieldId ipv4_flags;
    FieldId ipv4_fragment_offset;
    FieldId ipv4_ttl;
    FieldId ipv4_protocol;
    FieldId ipv4_checksum;
    FieldId ipv4_source;
    FieldId ipv4_destination;
    FieldId ipv4_options;
    FieldId udp_datagram;
    FieldId udp_source_port;
    FieldId udp_destination_port;
    FieldId udp_length;
    FieldId udp_checksum;
    FieldId udp_payload;
};

namespace {

constexpr std::uint32_t kEthernetLinkType = 1;
constexpr std::uint16_t kIpv4EtherType = 0x0800;
constexpr std::uint8_t kUdpProtocol = 17;
constexpr std::size_t kEthernetHeaderLength = 14;
constexpr std::size_t kIpv4MinimumHeaderLength = 20;
constexpr std::size_t kUdpHeaderLength = 8;
constexpr std::string_view kCapturedSourceName = "Captured frame";

FieldId resolve_field(const RegistrySnapshot& registry, std::string_view key) {
    const auto result = registry.field(key);
    if (const auto* descriptor = std::get_if<std::reference_wrapper<const FieldDescriptor>>(&result)) {
        return descriptor->get().id;
    }
    throw std::logic_error("The built-in parser registry is missing field " + std::string(key));
}

bool is_resource_error(TreeBuildErrorCode code) noexcept {
    return code >= TreeBuildErrorCode::MaxNodes && code <= TreeBuildErrorCode::AllocationFailed;
}

class ParseSession {
public:
    ParseSession(RegistrySnapshotPtr registry, sniffing::PacketKey packet_key, ParseBudget budget,
                 const PacketParser::FieldIds& fields, ParsedPacketTree storage)
        : builder_(std::move(registry), packet_key, std::move(storage), budget), fields_(fields) {}

    [[nodiscard]] std::optional<DataSourceId> add_source(std::span<const std::byte> bytes) {
        return accept(builder_.add_data_source(kCapturedSourceName, bytes, DataSourceKind::Captured));
    }

    [[nodiscard]] std::optional<std::uint32_t> add_protocol(FieldId field, std::uint32_t parent, const PacketView& view,
                                                            std::size_t length) {
        return accept(builder_.add_none(field, parent, view.data_source_id(), view.absolute_offset(), length));
    }

    [[nodiscard]] std::optional<std::uint32_t> add_unsigned(FieldId field, std::uint32_t parent, const PacketView& view,
                                                            std::size_t offset, std::size_t length, std::uint64_t value,
                                                            std::uint32_t flags = ParsedNodeFlagNone) {
        return accept(builder_.add_unsigned(field, parent, view.data_source_id(), view.absolute_offset() + offset,
                                            length, value, flags));
    }

    [[nodiscard]] bool add_bytes(FieldId field, std::uint32_t parent, const PacketView& view, std::size_t offset,
                                 std::span<const std::byte> value) {
        return accept(builder_.add_source_bytes(field, parent, view.data_source_id(), view.absolute_offset() + offset,
                                                value.size()))
            .has_value();
    }

    [[nodiscard]] bool add_unknown(std::uint32_t parent, const PacketView& view, std::size_t offset,
                                   std::size_t logical_length) {
        if (offset > view.captured_length()) {
            return true;
        }
        const auto available = std::min(logical_length, view.captured_length() - offset);
        return add_bytes(fields_.unknown_data, parent, view, offset, view.captured().subspan(offset, available));
    }

    template <typename Value> [[nodiscard]] std::optional<Value> read(PacketReadResult<Value> result) {
        if (auto* value = std::get_if<Value>(&result)) {
            return std::move(*value);
        }
        const auto& failure = std::get<PacketReadError>(result);
        if (failure.code == PacketReadErrorCode::CaptureTruncated) {
            mark_partial();
        } else {
            mark_malformed();
        }
        return std::nullopt;
    }

    void mark_partial() {
        if (builder_.condition() == ParseCondition::Complete) {
            (void)builder_.set_condition(ParseCondition::Partial);
        }
    }

    void mark_malformed() {
        if (builder_.condition() != ParseCondition::ResourceLimit) {
            (void)builder_.set_condition(ParseCondition::Malformed);
        }
    }

    void mark_resource_limit() {
        (void)builder_.set_condition(ParseCondition::ResourceLimit);
        stopped_ = true;
    }

    [[nodiscard]] bool stopped() const noexcept { return stopped_; }

    [[nodiscard]] ParsedPacketTree finalize() {
        auto result = builder_.finalize();
        if (auto* tree = std::get_if<ParsedPacketTree>(&result)) {
            return std::move(*tree);
        }
        throw std::runtime_error("The packet parser could not finalize a structurally valid tree.");
    }

private:
    template <typename Value> [[nodiscard]] std::optional<Value> accept(TreeResult<Value> result) {
        if (auto* value = std::get_if<Value>(&result)) {
            return std::move(*value);
        }
        const auto error = std::get<TreeBuildError>(result);
        if (is_resource_error(error.code)) {
            mark_resource_limit();
            return std::nullopt;
        }
        throw std::logic_error("The packet parser attempted to construct an invalid tree node.");
    }

    ParsedPacketTreeBuilder builder_;
    const PacketParser::FieldIds& fields_;
    bool stopped_ = false;
};

std::size_t protocol_span(const PacketView& view, std::size_t logical_length) noexcept {
    return std::min(view.captured_length(), logical_length);
}

void parse_udp(ParseSession& session, const PacketParser::FieldIds& fields, const PacketView& view,
               std::uint32_t parent) {
    auto declared_length = session.read(view.read_be16(4));
    const auto span = declared_length.has_value()
                          ? protocol_span(view, std::max<std::size_t>(*declared_length, kUdpHeaderLength))
                          : view.captured_length();
    const auto udp_node = session.add_protocol(fields.udp_datagram, parent, view, span);
    if (!udp_node.has_value() || !declared_length.has_value() || session.stopped()) {
        return;
    }

    const auto source_port = session.read(view.read_be16(0));
    const auto destination_port = session.read(view.read_be16(2));
    const auto checksum = session.read(view.read_be16(6));
    if (!source_port || !destination_port || !checksum) {
        return;
    }
    if (!session.add_unsigned(fields.udp_source_port, *udp_node, view, 0, 2, *source_port) ||
        !session.add_unsigned(fields.udp_destination_port, *udp_node, view, 2, 2, *destination_port) ||
        !session.add_unsigned(fields.udp_length, *udp_node, view, 4, 2, *declared_length) ||
        !session.add_unsigned(fields.udp_checksum, *udp_node, view, 6, 2, *checksum)) {
        return;
    }
    if (*declared_length < kUdpHeaderLength || *declared_length > view.reported_length()) {
        session.mark_malformed();
        return;
    }

    const auto payload_length = *declared_length - kUdpHeaderLength;
    const auto available_payload =
        std::min(payload_length, view.captured_length() > kUdpHeaderLength ? view.captured_length() - kUdpHeaderLength
                                                                           : std::size_t{0});
    if (available_payload < payload_length) {
        session.mark_partial();
    }
    if (!session.add_bytes(
            fields.udp_payload, *udp_node, view, kUdpHeaderLength,
            view.captured().subspan(std::min(kUdpHeaderLength, view.captured_length()), available_payload))) {
        return;
    }
    if (*declared_length < view.reported_length()) {
        (void)session.add_unknown(parent, view, *declared_length, view.reported_length() - *declared_length);
    }
}

std::optional<std::size_t> parse_ipv4(ParseSession& session, const PacketParser::FieldIds& fields,
                                      const PacketView& view, std::uint32_t parent) {
    const auto first_byte = session.read(view.read_u8(0));
    const auto total_length = session.read(view.read_be16(2));
    const auto ip_node = session.add_protocol(
        fields.ipv4_packet, parent, view,
        total_length ? protocol_span(view, std::max<std::size_t>(*total_length, kIpv4MinimumHeaderLength))
                     : view.captured_length());
    if (!ip_node || !first_byte || !total_length || session.stopped()) {
        return std::nullopt;
    }

    const auto version = static_cast<std::uint8_t>(*first_byte >> 4U);
    const auto header_length = static_cast<std::size_t>(*first_byte & 0x0fU) * 4U;
    const auto dscp_ecn = session.read(view.read_u8(1));
    const auto identification = session.read(view.read_be16(4));
    const auto flags_fragment = session.read(view.read_be16(6));
    const auto ttl = session.read(view.read_u8(8));
    const auto protocol = session.read(view.read_u8(9));
    const auto checksum = session.read(view.read_be16(10));
    const auto source = session.read(view.read_bytes(12, 4));
    const auto destination = session.read(view.read_bytes(16, 4));
    if (!dscp_ecn || !identification || !flags_fragment || !ttl || !protocol || !checksum || !source || !destination) {
        return std::nullopt;
    }

    if (!session.add_unsigned(fields.ipv4_version, *ip_node, view, 0, 1, version) ||
        !session.add_unsigned(fields.ipv4_header_length, *ip_node, view, 0, 1, header_length) ||
        !session.add_unsigned(fields.ipv4_dscp_ecn, *ip_node, view, 1, 1, *dscp_ecn) ||
        !session.add_unsigned(fields.ipv4_total_length, *ip_node, view, 2, 2, *total_length) ||
        !session.add_unsigned(fields.ipv4_identification, *ip_node, view, 4, 2, *identification) ||
        !session.add_unsigned(fields.ipv4_flags, *ip_node, view, 6, 2, *flags_fragment >> 13U) ||
        !session.add_unsigned(fields.ipv4_fragment_offset, *ip_node, view, 6, 2, *flags_fragment & 0x1fffU) ||
        !session.add_unsigned(fields.ipv4_ttl, *ip_node, view, 8, 1, *ttl) ||
        !session.add_unsigned(fields.ipv4_protocol, *ip_node, view, 9, 1, *protocol) ||
        !session.add_unsigned(fields.ipv4_checksum, *ip_node, view, 10, 2, *checksum) ||
        !session.add_bytes(fields.ipv4_source, *ip_node, view, 12, *source) ||
        !session.add_bytes(fields.ipv4_destination, *ip_node, view, 16, *destination)) {
        return std::nullopt;
    }

    if (version != 4 || header_length < kIpv4MinimumHeaderLength || *total_length < header_length ||
        *total_length > view.reported_length()) {
        session.mark_malformed();
        return std::nullopt;
    }
    if (header_length > kIpv4MinimumHeaderLength) {
        const auto options =
            session.read(view.read_bytes(kIpv4MinimumHeaderLength, header_length - kIpv4MinimumHeaderLength));
        if (!options || !session.add_bytes(fields.ipv4_options, *ip_node, view, kIpv4MinimumHeaderLength, *options)) {
            return std::nullopt;
        }
    }

    const auto ip_payload_length = *total_length - header_length;
    const auto payload_result = view.subview(header_length, ip_payload_length, ip_payload_length);
    if (!payload_result.has_value()) {
        session.mark_malformed();
        return std::nullopt;
    }
    const auto& payload = *payload_result.value();
    if (payload.captured_length() < ip_payload_length) {
        session.mark_partial();
    }
    if ((*flags_fragment & 0x8000U) != 0) {
        session.mark_malformed();
        (void)session.add_unknown(*ip_node, payload, 0, ip_payload_length);
        return *total_length;
    }
    const auto more_fragments = (*flags_fragment & 0x2000U) != 0;
    const auto fragment_offset = *flags_fragment & 0x1fffU;
    if (more_fragments || fragment_offset != 0 || *protocol != kUdpProtocol) {
        (void)session.add_unknown(*ip_node, payload, 0, ip_payload_length);
        return *total_length;
    }
    parse_udp(session, fields, payload, *ip_node);
    return *total_length;
}

void parse_ethernet(ParseSession& session, const PacketParser::FieldIds& fields, const PacketView& view,
                    std::uint32_t parent) {
    const auto ethernet_node = session.add_protocol(fields.ethernet_frame, parent, view, view.captured_length());
    if (!ethernet_node || session.stopped()) {
        return;
    }
    const auto destination = session.read(view.read_bytes(0, 6));
    const auto source = session.read(view.read_bytes(6, 6));
    const auto type = session.read(view.read_be16(12));
    if (!destination || !source || !type) {
        return;
    }
    if (!session.add_bytes(fields.ethernet_destination, *ethernet_node, view, 0, *destination) ||
        !session.add_bytes(fields.ethernet_source, *ethernet_node, view, 6, *source) ||
        !session.add_unsigned(fields.ethernet_type, *ethernet_node, view, 12, 2, *type)) {
        return;
    }

    const auto payload_length = view.reported_length() - kEthernetHeaderLength;
    const auto payload_result = view.subview(kEthernetHeaderLength, payload_length, payload_length);
    if (!payload_result.has_value()) {
        session.mark_malformed();
        return;
    }
    const auto& payload = *payload_result.value();
    if (*type > 1500 && *type < 1536) {
        session.mark_malformed();
    }
    if (*type <= 1500 && *type != 0) {
        if (*type > payload_length) {
            session.mark_malformed();
        }
        const auto declared_payload = std::min<std::size_t>(*type, payload_length);
        if (!session.add_unknown(*ethernet_node, payload, 0, declared_payload)) {
            return;
        }
        if (declared_payload < payload_length) {
            (void)session.add_unknown(*ethernet_node, payload, declared_payload, payload_length - declared_payload);
        }
        return;
    }
    if (*type != kIpv4EtherType) {
        (void)session.add_unknown(*ethernet_node, payload, 0, payload_length);
        return;
    }
    const auto consumed = parse_ipv4(session, fields, payload, *ethernet_node);
    if (consumed && *consumed < payload_length) {
        (void)session.add_unknown(*ethernet_node, payload, *consumed, payload_length - *consumed);
    }
}

} // namespace

PacketParser::PacketParser(RegistrySnapshotPtr registry, ParseBudget budget)
    : registry_(std::move(registry)), budget_(budget) {
    if (!registry_) {
        throw std::invalid_argument("PacketParser requires a registry snapshot.");
    }
    constexpr auto structural_bytes =
        kParsedTreeEncodedOverhead + sizeof(ParsedDataSource) + kCapturedSourceName.size() + sizeof(ParsedFieldNode);
    if (budget_.max_data_sources < 1 || budget_.max_nodes < 1 || budget_.max_depth < 1 ||
        budget_.max_string_bytes < kCapturedSourceName.size() || budget_.max_encoded_bytes < structural_bytes) {
        throw std::invalid_argument("PacketParser budget cannot hold the mandatory source and root node.");
    }
    fields_ = std::make_shared<FieldIds>(FieldIds{
        .root_frame = resolve_field(*registry_, "root.frame"),
        .root_captured_length = resolve_field(*registry_, "root.captured_length"),
        .root_reported_length = resolve_field(*registry_, "root.reported_length"),
        .root_link_type = resolve_field(*registry_, "root.link_type"),
        .unknown_data = resolve_field(*registry_, "unknown.data"),
        .ethernet_frame = resolve_field(*registry_, "eth.frame"),
        .ethernet_destination = resolve_field(*registry_, "eth.destination"),
        .ethernet_source = resolve_field(*registry_, "eth.source"),
        .ethernet_type = resolve_field(*registry_, "eth.type"),
        .ipv4_packet = resolve_field(*registry_, "ipv4.packet"),
        .ipv4_version = resolve_field(*registry_, "ipv4.version"),
        .ipv4_header_length = resolve_field(*registry_, "ipv4.header_length"),
        .ipv4_dscp_ecn = resolve_field(*registry_, "ipv4.dscp_ecn"),
        .ipv4_total_length = resolve_field(*registry_, "ipv4.total_length"),
        .ipv4_identification = resolve_field(*registry_, "ipv4.identification"),
        .ipv4_flags = resolve_field(*registry_, "ipv4.flags"),
        .ipv4_fragment_offset = resolve_field(*registry_, "ipv4.fragment_offset"),
        .ipv4_ttl = resolve_field(*registry_, "ipv4.ttl"),
        .ipv4_protocol = resolve_field(*registry_, "ipv4.protocol"),
        .ipv4_checksum = resolve_field(*registry_, "ipv4.checksum"),
        .ipv4_source = resolve_field(*registry_, "ipv4.source"),
        .ipv4_destination = resolve_field(*registry_, "ipv4.destination"),
        .ipv4_options = resolve_field(*registry_, "ipv4.options"),
        .udp_datagram = resolve_field(*registry_, "udp.datagram"),
        .udp_source_port = resolve_field(*registry_, "udp.source_port"),
        .udp_destination_port = resolve_field(*registry_, "udp.destination_port"),
        .udp_length = resolve_field(*registry_, "udp.length"),
        .udp_checksum = resolve_field(*registry_, "udp.checksum"),
        .udp_payload = resolve_field(*registry_, "udp.payload"),
    });
}

ParsedPacketTree PacketParser::parse(const sniffing::RawPacketView& packet) {
    if (packet.metadata.key.capture_id.is_nil() || packet.metadata.key.packet_id == 0) {
        throw std::invalid_argument("PacketParser requires a valid packet key.");
    }
    const auto declared_captured = static_cast<std::size_t>(packet.metadata.captured_len);
    constexpr auto structural_bytes =
        kParsedTreeEncodedOverhead + sizeof(ParsedDataSource) + kCapturedSourceName.size() + sizeof(ParsedFieldNode);
    const auto encoded_source_limit = budget_.max_encoded_bytes - structural_bytes;
    const auto source_limit = std::min(budget_.max_source_bytes, encoded_source_limit);
    const auto unbounded_captured_length = std::min(packet.bytes.size(), declared_captured);
    const auto captured_length = std::min(unbounded_captured_length, source_limit);
    const bool resource_clipped = captured_length < unbounded_captured_length;
    const auto captured = packet.bytes.first(captured_length);
    auto storage = has_recycled_tree_ ? std::move(recycled_tree_) : ParsedPacketTree{};
    has_recycled_tree_ = false;
    ParseSession session(registry_, packet.metadata.key, budget_, *fields_, std::move(storage));
    const auto source = session.add_source(captured);
    if (!source) {
        throw std::runtime_error("PacketParser budget cannot hold the captured data source.");
    }
    const auto root_view = PacketView::from_capture(captured, packet.metadata.wire_len, *source);
    const auto root = session.add_protocol(fields_->root_frame, kNoParentIndex, root_view, root_view.captured_length());
    if (!root) {
        throw std::runtime_error("PacketParser budget cannot hold the root node.");
    }
    if (resource_clipped) {
        session.mark_resource_limit();
        return session.finalize();
    }
    if (!session.add_unsigned(fields_->root_captured_length, *root, root_view, 0, 0, packet.metadata.captured_len,
                              ParsedNodeFlagGenerated) ||
        !session.add_unsigned(fields_->root_reported_length, *root, root_view, 0, 0, packet.metadata.wire_len,
                              ParsedNodeFlagGenerated) ||
        !session.add_unsigned(fields_->root_link_type, *root, root_view, 0, 0, packet.metadata.link_type,
                              ParsedNodeFlagGenerated)) {
        return session.finalize();
    }
    if (packet.metadata.captured_len > packet.metadata.wire_len) {
        session.mark_malformed();
    } else if (packet.bytes.size() < declared_captured || captured_length < packet.metadata.wire_len ||
               (packet.metadata.flags & sniffing::PacketFlagTruncated) != 0) {
        session.mark_partial();
    }
    if (packet.metadata.link_type != kEthernetLinkType) {
        (void)session.add_unknown(*root, root_view, 0, root_view.reported_length());
        return session.finalize();
    }
    parse_ethernet(session, *fields_, root_view, *root);
    return session.finalize();
}

void PacketParser::recycle(ParsedPacketTree tree) noexcept {
    recycled_tree_ = std::move(tree);
    has_recycled_tree_ = true;
}

} // namespace pruftnet::parsing::internal

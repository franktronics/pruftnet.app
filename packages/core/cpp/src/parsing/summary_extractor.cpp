#include "pruftnet/parsing/summary_extractor.hpp"

#include <array>
#include <charconv>
#include <functional>
#include <optional>

namespace pruftnet::parsing {
namespace {
FieldId field_id(const RegistrySnapshot& registry, std::string_view key) {
    const auto value = registry.field(key);
    const auto* field = std::get_if<std::reference_wrapper<const FieldDescriptor>>(&value);
    return field ? field->get().id : FieldId{};
}

std::string decimal(std::uint64_t value) {
    std::array<char, 24> buffer{};
    const auto result = std::to_chars(buffer.data(), buffer.data() + buffer.size(), value);
    return {buffer.data(), result.ptr};
}

std::string hexadecimal(std::uint64_t value) {
    std::array<char, 17> buffer{};
    const auto result = std::to_chars(buffer.data(), buffer.data() + buffer.size(), value, 16);
    return {buffer.data(), result.ptr};
}

std::string format_hex_bytes(std::span<const std::byte> bytes) {
    static constexpr char digits[] = "0123456789abcdef";
    std::string result("0x");
    result.reserve(2 + bytes.size() * 2);
    for (const auto byte : bytes) {
        const auto value = std::to_integer<unsigned char>(byte);
        result += digits[value >> 4U];
        result += digits[value & 0x0fU];
    }
    return result;
}

std::string format_mac(std::span<const std::byte> bytes) {
    if (bytes.size() != 6) return {};
    static constexpr char digits[] = "0123456789abcdef";
    std::string result(17, ':');
    for (std::size_t index = 0; index < bytes.size(); ++index) {
        const auto value = std::to_integer<unsigned char>(bytes[index]);
        result[index * 3] = digits[value >> 4U];
        result[index * 3 + 1] = digits[value & 0x0fU];
    }
    return result;
}

std::string format_ipv4(std::span<const std::byte> bytes) {
    if (bytes.size() != 4) return {};
    std::string result;
    for (std::size_t index = 0; index < bytes.size(); ++index) {
        if (index != 0) result += '.';
        result += decimal(std::to_integer<unsigned char>(bytes[index]));
    }
    return result;
}

std::string format_ipv6(std::span<const std::byte> bytes) {
    if (bytes.size() != 16) return {};
    std::array<std::uint16_t, 8> words{};
    for (std::size_t index = 0; index < words.size(); ++index)
        words[index] = static_cast<std::uint16_t>(
            std::to_integer<unsigned char>(bytes[index * 2]) << 8U |
            std::to_integer<unsigned char>(bytes[index * 2 + 1]));
    std::size_t best_start = 0, best_size = 0;
    for (std::size_t index = 0; index < words.size();) {
        if (words[index] != 0) { ++index; continue; }
        const auto start = index;
        while (index < words.size() && words[index] == 0) ++index;
        if (index - start > best_size) { best_start = start; best_size = index - start; }
    }
    if (best_size < 2) best_size = 0;
    std::string result;
    for (std::size_t index = 0; index < words.size();) {
        if (best_size != 0 && index == best_start) {
            result += "::";
            index += best_size;
        } else {
            if (!result.empty() && result.back() != ':') result += ':';
            result += hexadecimal(words[index++]);
        }
    }
    return result.empty() ? "::" : result;
}

void bound(std::string& value) {
    if (value.size() <= kPacketSummaryColumnMaxBytes) return;
    value.resize(kPacketSummaryColumnMaxBytes);
    auto start = value.size() - 1;
    while (start > 0 && (static_cast<unsigned char>(value[start]) & 0xc0U) == 0x80U) --start;
    const auto lead = static_cast<unsigned char>(value[start]);
    const auto expected = lead < 0x80U ? 1U : lead < 0xe0U ? 2U : lead < 0xf0U ? 3U : 4U;
    if (value.size() - start < expected) value.resize(start);
}
} // namespace

struct SummaryExtractor::Fields {
    std::vector<ProtocolId> protocol_by_field;
    std::vector<std::string> protocol_names;
    FieldId arp_packet;
    FieldId tcp_packet, udp_packet, icmp_packet, icmpv6_packet;
    FieldId ethernet_source, ethernet_destination;
    FieldId ipv4_source, ipv4_destination, ipv6_source, ipv6_destination;
    FieldId arp_protocol_type, arp_operation, arp_sender_hardware, arp_sender_protocol, arp_target_protocol;
    FieldId tcp_source, tcp_destination, tcp_sequence, tcp_ack, tcp_flags, tcp_window, tcp_payload;
    FieldId udp_source, udp_destination, udp_length;
    FieldId icmp_type, icmp_code, icmp_identifier, icmp_sequence, icmp_mtu;
    FieldId icmpv6_type, icmpv6_code, icmpv6_identifier, icmpv6_sequence, icmpv6_mtu;
};

SummaryExtractor::SummaryExtractor(const RegistrySnapshot& registry) {
    Fields fields{};
    fields.protocol_by_field.resize(registry.fields().size() + 1);
    fields.protocol_names.resize(registry.protocols().size() + 1);
    for (const auto& descriptor : registry.protocols()) {
        auto& name = fields.protocol_names[descriptor.id.value];
        if (descriptor.key == "eth") name = "Ethernet";
        else if (descriptor.key == "ipv4") name = "IPv4";
        else if (descriptor.key == "ipv6") name = "IPv6";
        else if (descriptor.key == "vlan") name = "VLAN";
        else name = descriptor.display_name;
    }
    for (const auto& descriptor : registry.fields())
        if (descriptor.value_type == FieldValueType::Protocol)
            fields.protocol_by_field[descriptor.id.value] = descriptor.protocol_id;
#define RESOLVE(name, key) fields.name = field_id(registry, key)
    RESOLVE(arp_packet, "arp.packet");
    RESOLVE(tcp_packet, "tcp.segment"); RESOLVE(udp_packet, "udp.datagram");
    RESOLVE(icmp_packet, "icmp.message"); RESOLVE(icmpv6_packet, "icmpv6.message");
    RESOLVE(ethernet_source, "eth.source"); RESOLVE(ethernet_destination, "eth.destination");
    RESOLVE(ipv4_source, "ipv4.source"); RESOLVE(ipv4_destination, "ipv4.destination");
    RESOLVE(ipv6_source, "ipv6.source"); RESOLVE(ipv6_destination, "ipv6.destination");
    RESOLVE(arp_protocol_type, "arp.protocol_type"); RESOLVE(arp_operation, "arp.operation");
    RESOLVE(arp_sender_hardware, "arp.sender_hardware");
    RESOLVE(arp_sender_protocol, "arp.sender_protocol"); RESOLVE(arp_target_protocol, "arp.target_protocol");
    RESOLVE(tcp_source, "tcp.source_port"); RESOLVE(tcp_destination, "tcp.destination_port");
    RESOLVE(tcp_sequence, "tcp.sequence_number"); RESOLVE(tcp_ack, "tcp.acknowledgment_number");
    RESOLVE(tcp_flags, "tcp.flags"); RESOLVE(tcp_window, "tcp.window"); RESOLVE(tcp_payload, "tcp.payload");
    RESOLVE(udp_source, "udp.source_port"); RESOLVE(udp_destination, "udp.destination_port");
    RESOLVE(udp_length, "udp.length"); RESOLVE(icmp_type, "icmp.type"); RESOLVE(icmp_code, "icmp.code");
    RESOLVE(icmp_identifier, "icmp.identifier"); RESOLVE(icmp_sequence, "icmp.sequence"); RESOLVE(icmp_mtu, "icmp.mtu");
    RESOLVE(icmpv6_type, "icmpv6.type"); RESOLVE(icmpv6_code, "icmpv6.code");
    RESOLVE(icmpv6_identifier, "icmpv6.identifier"); RESOLVE(icmpv6_sequence, "icmpv6.sequence");
    RESOLVE(icmpv6_mtu, "icmpv6.mtu");
#undef RESOLVE
    fields_ = std::make_shared<Fields>(std::move(fields));
}

PacketSummaryFields SummaryExtractor::extract(const sniffing::RawPacketView& raw,
                                              const ParsedPacketTree& tree) const {
    PacketSummaryFields result{{}, {}, {}, "Unknown", decimal(raw.metadata.wire_len), {}};
    const auto& f = *fields_;
    std::string ethernet_source, ethernet_destination, ipv4_source, ipv4_destination,
        ipv6_source, ipv6_destination, arp_source, arp_destination, arp_mac;
    std::optional<std::uint64_t> source_port, destination_port, sequence, acknowledgment,
        flags, window, udp_length, arp_protocol_type, arp_operation, type, code, identifier, echo_sequence, mtu,
        type6, code6, identifier6, echo_sequence6, mtu6;
    bool tcp = false, udp = false, arp = false, icmp = false, icmpv6 = false;
    std::optional<std::size_t> tcp_payload_length;
    std::vector<std::optional<std::uint64_t>> unsigned_values(f.protocol_by_field.size());
    for (const auto& node : tree.nodes()) {
        if (node.value_tag == ParsedValueTag::Unsigned && node.field_id.value < unsigned_values.size())
            unsigned_values[node.field_id.value] = node.value_low;
        if (node.field_id.value < f.protocol_by_field.size()) {
            const auto protocol = f.protocol_by_field[node.field_id.value];
            if (protocol.is_valid() && (result.protocol_path.empty() || result.protocol_path.back() != protocol))
                result.protocol_path.push_back(protocol);
        }
        arp |= node.field_id == f.arp_packet;
        tcp |= node.field_id == f.tcp_packet; udp |= node.field_id == f.udp_packet;
        icmp |= node.field_id == f.icmp_packet; icmpv6 |= node.field_id == f.icmpv6_packet;
        const auto bytes = tree.node_bytes(node);
        if (node.field_id == f.ethernet_source) ethernet_source = format_mac(bytes);
        else if (node.field_id == f.ethernet_destination) ethernet_destination = format_mac(bytes);
        else if (node.field_id == f.ipv4_source) ipv4_source = format_ipv4(bytes);
        else if (node.field_id == f.ipv4_destination) ipv4_destination = format_ipv4(bytes);
        else if (node.field_id == f.ipv6_source) ipv6_source = format_ipv6(bytes);
        else if (node.field_id == f.ipv6_destination) ipv6_destination = format_ipv6(bytes);
        else if (node.field_id == f.arp_sender_protocol) arp_source = format_hex_bytes(bytes);
        else if (node.field_id == f.arp_target_protocol) arp_destination = format_hex_bytes(bytes);
        else if (node.field_id == f.arp_sender_hardware) arp_mac = format_mac(bytes);
        else if (node.field_id == f.tcp_payload) tcp_payload_length = bytes.size();
    }
    const auto value = [&](FieldId id) -> std::optional<std::uint64_t> {
        return id.value < unsigned_values.size() ? unsigned_values[id.value] : std::nullopt;
    };
    source_port = value(tcp ? f.tcp_source : f.udp_source);
    destination_port = value(tcp ? f.tcp_destination : f.udp_destination);
    sequence = value(f.tcp_sequence); acknowledgment = value(f.tcp_ack); flags = value(f.tcp_flags);
    window = value(f.tcp_window); udp_length = value(f.udp_length);
    arp_protocol_type = value(f.arp_protocol_type); arp_operation = value(f.arp_operation);
    type = value(f.icmp_type); code = value(f.icmp_code); identifier = value(f.icmp_identifier);
    echo_sequence = value(f.icmp_sequence); mtu = value(f.icmp_mtu);
    type6 = value(f.icmpv6_type); code6 = value(f.icmpv6_code); identifier6 = value(f.icmpv6_identifier);
    echo_sequence6 = value(f.icmpv6_sequence); mtu6 = value(f.icmpv6_mtu);
    if (arp_protocol_type == 0x0800) {
        for (const auto& node : tree.nodes()) {
            if (node.field_id == f.arp_sender_protocol) arp_source = format_ipv4(tree.node_bytes(node));
            else if (node.field_id == f.arp_target_protocol) arp_destination = format_ipv4(tree.node_bytes(node));
        }
    }
    if (!ipv6_source.empty() && !ipv6_destination.empty()) {
        result.source = ipv6_source; result.destination = ipv6_destination;
    } else if (!ipv4_source.empty() && !ipv4_destination.empty()) {
        result.source = ipv4_source; result.destination = ipv4_destination;
    } else if (!arp_source.empty() && !arp_destination.empty()) {
        result.source = arp_source; result.destination = arp_destination;
    } else {
        result.source = ethernet_source; result.destination = ethernet_destination;
    }
    if (tcp) {
        result.protocol = "TCP";
        if (source_port && destination_port)
            result.info = decimal(*source_port) + " -> " + decimal(*destination_port);
        else
            result.info = "Truncated TCP header";
        if (flags) result.info += " Flags=0x" + hexadecimal(*flags);
        if (sequence) result.info += " Seq=" + decimal(*sequence);
        if (acknowledgment) result.info += " Ack=" + decimal(*acknowledgment);
        if (window) result.info += " Win=" + decimal(*window);
        if (tcp_payload_length) result.info += " Len=" + decimal(*tcp_payload_length);
    } else if (udp) {
        result.protocol = "UDP";
        if (source_port && destination_port)
            result.info = decimal(*source_port) + " -> " + decimal(*destination_port);
        else
            result.info = "Truncated UDP header";
        if (udp_length) result.info += " Len=" + decimal(*udp_length);
    } else if (arp) {
        result.protocol = "ARP";
        if (arp_operation == 1 && !arp_source.empty() && !arp_destination.empty())
            result.info = "Who has " + arp_destination + "? Tell " + arp_source;
        else if (arp_operation == 2 && !arp_source.empty() && !arp_mac.empty())
            result.info = arp_source + " is at " + arp_mac;
        else if (arp_operation) result.info = "Operation " + decimal(*arp_operation);
        else result.info = "Truncated ARP header";
    } else if (icmpv6 || icmp) {
        result.protocol = icmpv6 ? "ICMPv6" : "ICMP";
        if (icmpv6) {
            type = type6; code = code6; identifier = identifier6; echo_sequence = echo_sequence6; mtu = mtu6;
        }
        if (!type || !code) {
            result.info = icmpv6 ? "Truncated ICMPv6 header" : "Truncated ICMP header";
        } else {
            const auto label = [&]() -> std::string_view {
                if (icmpv6) {
                    switch (*type) {
                    case 1: return "Destination unreachable"; case 2: return "Packet too big";
                    case 3: return "Time exceeded"; case 4: return "Parameter problem";
                    case 128: return "Echo request"; case 129: return "Echo reply";
                    case 133: return "Router solicitation"; case 134: return "Router advertisement";
                    case 135: return "Neighbor solicitation"; case 136: return "Neighbor advertisement";
                    case 137: return "Redirect"; default: return {};
                    }
                }
                switch (*type) {
                case 0: return "Echo reply"; case 3: return "Destination unreachable";
                case 5: return "Redirect"; case 8: return "Echo request";
                case 11: return "Time exceeded"; case 12: return "Parameter problem";
                default: return {};
                }
            }();
            result.info = label.empty() ? "Type " + decimal(*type) : std::string(label);
            result.info += ", Code " + decimal(*code);
        }
        if (identifier) result.info += ", id=" + decimal(*identifier);
        if (echo_sequence) result.info += ", seq=" + decimal(*echo_sequence);
        if (mtu) result.info += ", mtu=" + decimal(*mtu);
    } else if (!result.protocol_path.empty() && result.protocol_path.back().value < f.protocol_names.size())
        result.protocol = f.protocol_names[result.protocol_path.back().value];
    bound(result.source); bound(result.destination); bound(result.protocol); bound(result.length); bound(result.info);
    return result;
}

} // namespace pruftnet::parsing

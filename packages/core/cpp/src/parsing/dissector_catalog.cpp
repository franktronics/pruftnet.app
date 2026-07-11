#include "parsing/dissector_catalog.hpp"

#include <algorithm>
#include <limits>
#include <stdexcept>
#include <string>
#include <string_view>
#include <variant>

#include "parsing/dissectors/ethernet_dissector.hpp"
#include "parsing/dissectors/frame_dissector.hpp"
#include "parsing/dissectors/arp_dissector.hpp"
#include "parsing/dissectors/icmpv4_dissector.hpp"
#include "parsing/dissectors/icmpv6_dissector.hpp"
#include "parsing/dissectors/ipv4_dissector.hpp"
#include "parsing/dissectors/ipv6_dissector.hpp"
#include "parsing/dissectors/tcp_dissector.hpp"
#include "parsing/dissectors/udp_dissector.hpp"
#include "parsing/dissectors/vlan_dissector.hpp"

namespace pruftnet::parsing::internal {
namespace {

FieldId resolve_field(const RegistrySnapshot& registry, std::string_view key) {
    const auto result = registry.field(key);
    if (const auto* descriptor = std::get_if<std::reference_wrapper<const FieldDescriptor>>(&result)) {
        return descriptor->get().id;
    }
    throw std::logic_error("The core dissector catalog is missing field " + std::string(key));
}

template <typename State> std::shared_ptr<const State> state(State value) {
    return std::make_shared<const State>(std::move(value));
}

} // namespace

DissectorCatalog::DissectorCatalog(RegistrySnapshotPtr registry) : registry_(std::move(registry)) {
    if (!registry_) {
        throw std::invalid_argument("DissectorCatalog requires a registry snapshot.");
    }
    handles_.push_back({});
    common_ = state(CommonDissectorState{
        resolve_field(*registry_, "root.frame"),
        resolve_field(*registry_, "root.captured_length"),
        resolve_field(*registry_, "root.reported_length"),
        resolve_field(*registry_, "root.link_type"),
        resolve_field(*registry_, "unknown.data"),
    });
    root_ = add_handle(dissect_frame, common_);

    const auto ethernet = state(EthernetDissectorState{
        resolve_field(*registry_, "eth.frame"), resolve_field(*registry_, "eth.destination"),
        resolve_field(*registry_, "eth.source"), resolve_field(*registry_, "eth.type"),
    });
    bind_dlt(1, add_handle(dissect_ethernet, ethernet));

    const auto ipv4 = state(Ipv4DissectorState{
        resolve_field(*registry_, "ipv4.packet"),        resolve_field(*registry_, "ipv4.version"),
        resolve_field(*registry_, "ipv4.header_length"), resolve_field(*registry_, "ipv4.dscp_ecn"),
        resolve_field(*registry_, "ipv4.total_length"),  resolve_field(*registry_, "ipv4.identification"),
        resolve_field(*registry_, "ipv4.flags"),         resolve_field(*registry_, "ipv4.fragment_offset"),
        resolve_field(*registry_, "ipv4.ttl"),           resolve_field(*registry_, "ipv4.protocol"),
        resolve_field(*registry_, "ipv4.checksum"),      resolve_field(*registry_, "ipv4.source"),
        resolve_field(*registry_, "ipv4.destination"),   resolve_field(*registry_, "ipv4.options"),
    });
    bind_ethertype(0x0800, add_handle(dissect_ipv4, ipv4));

    const auto udp = state(UdpDissectorState{
        resolve_field(*registry_, "udp.datagram"), resolve_field(*registry_, "udp.source_port"),
        resolve_field(*registry_, "udp.destination_port"), resolve_field(*registry_, "udp.length"),
        resolve_field(*registry_, "udp.checksum"), resolve_field(*registry_, "udp.payload"),
    });
    const auto udp_handle = add_handle(dissect_udp, udp);
    bind_ip_protocol(IpFamily::V4, 17, udp_handle);
    bind_ip_protocol(IpFamily::V6, 17, udp_handle);

    const auto vlan = state(VlanDissectorState{
        resolve_field(*registry_, "vlan.tag"), resolve_field(*registry_, "vlan.priority"),
        resolve_field(*registry_, "vlan.dei"), resolve_field(*registry_, "vlan.id"),
        resolve_field(*registry_, "vlan.type"),
    });
    const auto vlan_handle = add_handle(dissect_vlan, vlan);
    bind_ethertype(0x8100, vlan_handle);
    bind_ethertype(0x88a8, vlan_handle);

    const auto tcp = state(TcpDissectorState{
        resolve_field(*registry_, "tcp.segment"), resolve_field(*registry_, "tcp.source_port"),
        resolve_field(*registry_, "tcp.destination_port"), resolve_field(*registry_, "tcp.sequence_number"),
        resolve_field(*registry_, "tcp.acknowledgment_number"), resolve_field(*registry_, "tcp.header_length"),
        resolve_field(*registry_, "tcp.reserved"), resolve_field(*registry_, "tcp.flags"),
        resolve_field(*registry_, "tcp.window"), resolve_field(*registry_, "tcp.checksum"),
        resolve_field(*registry_, "tcp.urgent_pointer"), resolve_field(*registry_, "tcp.options"),
        resolve_field(*registry_, "tcp.payload"),
    });
    const auto tcp_handle = add_handle(dissect_tcp, tcp);
    bind_ip_protocol(IpFamily::V4, 6, tcp_handle);
    bind_ip_protocol(IpFamily::V6, 6, tcp_handle);

    const auto arp = state(ArpDissectorState{
        resolve_field(*registry_, "arp.packet"), resolve_field(*registry_, "arp.hardware_type"),
        resolve_field(*registry_, "arp.protocol_type"), resolve_field(*registry_, "arp.hardware_length"),
        resolve_field(*registry_, "arp.protocol_length"), resolve_field(*registry_, "arp.operation"),
        resolve_field(*registry_, "arp.sender_hardware"), resolve_field(*registry_, "arp.sender_protocol"),
        resolve_field(*registry_, "arp.target_hardware"), resolve_field(*registry_, "arp.target_protocol"),
    });
    bind_ethertype(0x0806, add_handle(dissect_arp, arp));

    const auto ipv6 = state(Ipv6DissectorState{
        resolve_field(*registry_, "ipv6.packet"), resolve_field(*registry_, "ipv6.version"),
        resolve_field(*registry_, "ipv6.traffic_class"), resolve_field(*registry_, "ipv6.flow_label"),
        resolve_field(*registry_, "ipv6.payload_length"), resolve_field(*registry_, "ipv6.next_header"),
        resolve_field(*registry_, "ipv6.hop_limit"), resolve_field(*registry_, "ipv6.source"),
        resolve_field(*registry_, "ipv6.destination"), resolve_field(*registry_, "ipv6.extension"),
        resolve_field(*registry_, "ipv6.extension_next_header"), resolve_field(*registry_, "ipv6.extension_length"),
        resolve_field(*registry_, "ipv6.extension_type"), resolve_field(*registry_, "ipv6.extension_data"),
        resolve_field(*registry_, "ipv6.fragment_offset_encoded"), resolve_field(*registry_, "ipv6.fragment_offset"),
        resolve_field(*registry_, "ipv6.fragment_reserved"), resolve_field(*registry_, "ipv6.fragment_more"),
        resolve_field(*registry_, "ipv6.fragment_identification"),
    });
    bind_ethertype(0x86dd, add_handle(dissect_ipv6, ipv6));

    const auto icmpv4 = state(Icmpv4DissectorState{
        resolve_field(*registry_, "icmp.message"), resolve_field(*registry_, "icmp.type"),
        resolve_field(*registry_, "icmp.code"), resolve_field(*registry_, "icmp.checksum"),
        resolve_field(*registry_, "icmp.identifier"), resolve_field(*registry_, "icmp.sequence"),
        resolve_field(*registry_, "icmp.gateway"), resolve_field(*registry_, "icmp.pointer"),
        resolve_field(*registry_, "icmp.mtu"), resolve_field(*registry_, "icmp.body"),
        resolve_field(*registry_, "icmp.quoted"),
    });
    bind_ip_protocol(IpFamily::V4, 1, add_handle(dissect_icmpv4, icmpv4));

    const auto icmpv6 = state(Icmpv6DissectorState{
        resolve_field(*registry_, "icmpv6.message"), resolve_field(*registry_, "icmpv6.type"),
        resolve_field(*registry_, "icmpv6.code"), resolve_field(*registry_, "icmpv6.checksum"),
        resolve_field(*registry_, "icmpv6.informational"), resolve_field(*registry_, "icmpv6.identifier"),
        resolve_field(*registry_, "icmpv6.sequence"), resolve_field(*registry_, "icmpv6.mtu"),
        resolve_field(*registry_, "icmpv6.pointer"), resolve_field(*registry_, "icmpv6.target"),
        resolve_field(*registry_, "icmpv6.destination"),
        resolve_field(*registry_, "icmpv6.flags"), resolve_field(*registry_, "icmpv6.current_hop_limit"),
        resolve_field(*registry_, "icmpv6.router_lifetime"), resolve_field(*registry_, "icmpv6.reachable_time"),
        resolve_field(*registry_, "icmpv6.retrans_timer"), resolve_field(*registry_, "icmpv6.body"),
        resolve_field(*registry_, "icmpv6.quoted"), resolve_field(*registry_, "icmpv6.option"),
        resolve_field(*registry_, "icmpv6.option_type"), resolve_field(*registry_, "icmpv6.option_length"),
        resolve_field(*registry_, "icmpv6.option_body"), resolve_field(*registry_, "icmpv6.redirected_packet"),
        resolve_field(*registry_, "icmpv6.link_layer_address"),
        resolve_field(*registry_, "icmpv6.prefix_length"), resolve_field(*registry_, "icmpv6.prefix_flags"),
        resolve_field(*registry_, "icmpv6.valid_lifetime"), resolve_field(*registry_, "icmpv6.preferred_lifetime"),
        resolve_field(*registry_, "icmpv6.prefix"),
    });
    bind_ip_protocol(IpFamily::V6, 58, add_handle(dissect_icmpv6, icmpv6));
}

std::uint16_t DissectorCatalog::add_handle(DissectorFunction function, std::shared_ptr<const void> state_owner) {
    if (function == nullptr || !state_owner || handles_.size() >= std::numeric_limits<std::uint16_t>::max()) {
        throw std::logic_error("Invalid or excessive dissector handle registration.");
    }
    states_.push_back(std::move(state_owner));
    handles_.push_back({function, states_.back().get()});
    return static_cast<std::uint16_t>(handles_.size() - 1);
}

void DissectorCatalog::bind_dlt(std::uint32_t selector, std::uint16_t handle_index) {
    const auto found = std::lower_bound(dlt_.begin(), dlt_.end(), selector,
                                        [](const auto& entry, std::uint32_t value) { return entry.first < value; });
    if (found != dlt_.end() && found->first == selector) {
        throw std::logic_error("Duplicate DLT dissector registration.");
    }
    dlt_.insert(found, {selector, handle_index});
}

void DissectorCatalog::bind_ethertype(std::uint16_t selector, std::uint16_t handle_index) {
    if (ethertype_[selector] != 0) {
        throw std::logic_error("Duplicate EtherType dissector registration.");
    }
    ethertype_[selector] = handle_index;
}

void DissectorCatalog::bind_ip_protocol(IpFamily family, std::uint8_t selector, std::uint16_t handle_index) {
    auto& table = family == IpFamily::V4 ? ipv4_protocol_ : ipv6_next_header_;
    if (table[selector] != 0) {
        throw std::logic_error("Duplicate IP protocol dissector registration.");
    }
    table[selector] = handle_index;
}

DissectorHandle DissectorCatalog::handle(std::uint16_t index) const noexcept {
    return index < handles_.size() ? handles_[index] : DissectorHandle{};
}

const RegistrySnapshotPtr& DissectorCatalog::registry() const noexcept { return registry_; }

const CommonDissectorState& DissectorCatalog::common() const noexcept { return *common_; }

DissectorHandle DissectorCatalog::root() const noexcept { return handle(root_); }

DissectorHandle DissectorCatalog::dlt(std::uint32_t value) const noexcept {
    const auto found = std::lower_bound(dlt_.begin(), dlt_.end(), value,
                                        [](const auto& entry, std::uint32_t selector) { return entry.first < selector; });
    return found != dlt_.end() && found->first == value ? handle(found->second) : DissectorHandle{};
}

DissectorHandle DissectorCatalog::ethertype(std::uint16_t value) const noexcept { return handle(ethertype_[value]); }

DissectorHandle DissectorCatalog::ip_protocol(IpFamily family, std::uint8_t value) const noexcept {
    return handle(family == IpFamily::V4 ? ipv4_protocol_[value] : ipv6_next_header_[value]);
}

DissectorCatalogPtr make_core_dissector_catalog(RegistrySnapshotPtr registry) {
    return std::make_shared<const DissectorCatalog>(std::move(registry));
}

} // namespace pruftnet::parsing::internal

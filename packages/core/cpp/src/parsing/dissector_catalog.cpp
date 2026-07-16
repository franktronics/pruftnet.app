#include "parsing/dissector_catalog.hpp"

#include <algorithm>
#include <limits>
#include <stdexcept>
#include <string_view>

#include "parsing/catalog/catalog_registrar.hpp"
#include "parsing/catalog/catalog_sections.hpp"
#include "parsing/dissectors/application/dhcp_dissector.hpp"
#include "parsing/dissectors/application/dhcpv6_dissector.hpp"
#include "parsing/dissectors/application/dns_dissector.hpp"
#include "parsing/dissectors/application/http_dissector.hpp"
#include "parsing/dissectors/application/ntp_dissector.hpp"
#include "parsing/dissectors/application/quic_dissector.hpp"
#include "parsing/dissectors/application/tls_dissector.hpp"
#include "parsing/dissectors/transport/tcp_dissector.hpp"
#include "parsing/dissectors/transport/udp_dissector.hpp"
#include "parsing/dissectors/tunnel/geneve_dissector.hpp"
#include "parsing/dissectors/tunnel/gre_dissector.hpp"
#include "parsing/dissectors/tunnel/mpls_dissector.hpp"
#include "parsing/dissectors/tunnel/vxlan_dissector.hpp"

namespace pruftnet::parsing::internal {
namespace {

template <typename State> std::shared_ptr<const State> state(State value) {
  return std::make_shared<const State>(std::move(value));
}

std::uint64_t snap_key(std::uint32_t oui, std::uint16_t pid) noexcept {
  return (static_cast<std::uint64_t>(oui) << 16U) | pid;
}

DnsDissectorState dns_state(const CatalogRegistrar &registrar,
                            std::string_view message_key, DnsFlavor flavor,
                            bool tcp) {
  return {
      registrar.field(message_key),
      registrar.field("dns.tcp_stream"),
      registrar.field("dns.tcp_length"),
      registrar.field("dns.id"),
      registrar.field("dns.flags"),
      registrar.field("dns.response"),
      registrar.field("dns.opcode"),
      registrar.field("dns.authoritative"),
      registrar.field("dns.truncated"),
      registrar.field("dns.recursion_desired"),
      registrar.field("dns.recursion_available"),
      registrar.field("dns.authenticated_data"),
      registrar.field("dns.checking_disabled"),
      registrar.field("dns.rcode"),
      registrar.field("llmnr.conflict"),
      registrar.field("llmnr.tentative"),
      registrar.field("dns.question_count"),
      registrar.field("dns.answer_count"),
      registrar.field("dns.authority_count"),
      registrar.field("dns.additional_count"),
      registrar.field("dns.question"),
      registrar.field("dns.question.name"),
      registrar.field("dns.question.type"),
      registrar.field("dns.question.class"),
      registrar.field("mdns.question.unicast_response"),
      registrar.field("dns.record"),
      registrar.field("dns.record.section"),
      registrar.field("dns.record.name"),
      registrar.field("dns.record.type"),
      registrar.field("dns.record.class"),
      registrar.field("mdns.record.cache_flush"),
      registrar.field("dns.record.ttl"),
      registrar.field("dns.record.length"),
      registrar.field("dns.record.data"),
      registrar.field("dns.address"),
      registrar.field("dns.target"),
      registrar.field("dns.preference"),
      registrar.field("dns.priority"),
      registrar.field("dns.weight"),
      registrar.field("dns.port"),
      registrar.field("dns.text"),
      registrar.field("dns.soa.mname"),
      registrar.field("dns.soa.rname"),
      registrar.field("dns.soa.serial"),
      registrar.field("dns.soa.refresh"),
      registrar.field("dns.soa.retry"),
      registrar.field("dns.soa.expire"),
      registrar.field("dns.soa.minimum"),
      registrar.field("dns.edns.udp_payload_size"),
      registrar.field("dns.edns.extended_rcode"),
      registrar.field("dns.edns.version"),
      registrar.field("dns.edns.flags"),
      registrar.field("dns.edns.option"),
      registrar.field("dns.edns.option.code"),
      registrar.field("dns.edns.option.length"),
      registrar.field("dns.edns.option.data"),
      registrar.field("dns.trailing"),
      flavor,
      tcp,
  };
}

} // namespace

DissectorCatalog::DissectorCatalog(RegistrySnapshotPtr registry)
    : registry_(std::move(registry)) {
  if (!registry_) {
    throw std::invalid_argument(
        "DissectorCatalog requires a registry snapshot.");
  }
  handles_.push_back({});
  CatalogRegistrar registrar(*this);
  register_core_catalog(registrar);
  const auto link_handles = register_link_catalog(registrar);
  register_network_catalog(registrar);

  const auto udp = state(UdpDissectorState{
      registrar.field("udp.datagram"),
      registrar.field("udp.source_port"),
      registrar.field("udp.destination_port"),
      registrar.field("udp.length"),
      registrar.field("udp.checksum"),
      registrar.field("udp.payload"),
  });
  const auto udp_handle = registrar.add(dissect_udp, udp);
  registrar.bind_ip_protocol(IpFamily::V4, 17, udp_handle);
  registrar.bind_ip_protocol(IpFamily::V6, 17, udp_handle);

  const auto tcp = state(TcpDissectorState{
      registrar.field("tcp.segment"),
      registrar.field("tcp.source_port"),
      registrar.field("tcp.destination_port"),
      registrar.field("tcp.sequence_number"),
      registrar.field("tcp.acknowledgment_number"),
      registrar.field("tcp.header_length"),
      registrar.field("tcp.reserved"),
      registrar.field("tcp.flags"),
      registrar.field("tcp.window"),
      registrar.field("tcp.checksum"),
      registrar.field("tcp.urgent_pointer"),
      registrar.field("tcp.options"),
      registrar.field("tcp.payload"),
      registrar.field("tcp.reassembled"),
      registrar.field("tcp.reassembled_length"),
      registrar.field("tcp.reassembled_segment_count"),
      registrar.field("tcp.reassembly_overlap"),
      registrar.field("tcp.reassembly_conflict"),
  });
  const auto tcp_handle = registrar.add(dissect_tcp, tcp);
  registrar.bind_ip_protocol(IpFamily::V4, 6, tcp_handle);
  registrar.bind_ip_protocol(IpFamily::V6, 6, tcp_handle);

  const auto dns_udp =
      state(dns_state(registrar, "dns.message", DnsFlavor::Dns, false));
  const auto dns_tcp =
      state(dns_state(registrar, "dns.message", DnsFlavor::Dns, true));
  const auto mdns_udp =
      state(dns_state(registrar, "mdns.message", DnsFlavor::Mdns, false));
  const auto llmnr_udp =
      state(dns_state(registrar, "llmnr.message", DnsFlavor::Llmnr, false));
  const auto llmnr_tcp =
      state(dns_state(registrar, "llmnr.message", DnsFlavor::Llmnr, true));
  registrar.bind_udp_port(53, registrar.add(dissect_dns, dns_udp));
  registrar.bind_tcp_port(53, registrar.add(dissect_dns, dns_tcp));
  registrar.bind_udp_port(5353, registrar.add(dissect_dns, mdns_udp));
  registrar.bind_udp_port(5355, registrar.add(dissect_dns, llmnr_udp));
  registrar.bind_tcp_port(5355, registrar.add(dissect_dns, llmnr_tcp));

  const auto http = state(HttpDissectorState{
      registrar.field("http.stream"),
      registrar.field("http.message"),
      registrar.field("http.request"),
      registrar.field("http.response"),
      registrar.field("http.request_line"),
      registrar.field("http.response_line"),
      registrar.field("http.method"),
      registrar.field("http.request_target"),
      registrar.field("http.version"),
      registrar.field("http.status_code"),
      registrar.field("http.reason_phrase"),
      registrar.field("http.header"),
      registrar.field("http.header.name"),
      registrar.field("http.header.value"),
      registrar.field("http.host"),
      registrar.field("http.user_agent"),
      registrar.field("http.content_type"),
      registrar.field("http.content_length"),
      registrar.field("http.transfer_encoding"),
      registrar.field("http.connection"),
      registrar.field("http.body"),
      registrar.field("http.chunk"),
      registrar.field("http.chunk.size"),
      registrar.field("http.chunk.extension"),
      registrar.field("http.chunk.data"),
      registrar.field("http.trailing"),
  });
  registrar.bind_tcp_port(80, registrar.add(dissect_http, http));

  const auto tls = state(TlsDissectorState{
      registrar.field("tls.stream"),
      registrar.field("tls.record"),
      registrar.field("tls.content_type"),
      registrar.field("tls.legacy_version"),
      registrar.field("tls.length"),
      registrar.field("tls.record_payload"),
      registrar.field("tls.alert"),
      registrar.field("tls.alert.level"),
      registrar.field("tls.alert.description"),
      registrar.field("tls.change_cipher_spec"),
      registrar.field("tls.heartbeat"),
      registrar.field("tls.heartbeat.type"),
      registrar.field("tls.heartbeat.length"),
      registrar.field("tls.heartbeat.payload"),
      registrar.field("tls.handshake"),
      registrar.field("tls.handshake.type"),
      registrar.field("tls.handshake.length"),
      registrar.field("tls.handshake.version"),
      registrar.field("tls.handshake.random"),
      registrar.field("tls.handshake.session_id"),
      registrar.field("tls.handshake.cipher_suites_length"),
      registrar.field("tls.handshake.cipher_suite"),
      registrar.field("tls.handshake.compression_methods_length"),
      registrar.field("tls.handshake.compression_method"),
      registrar.field("tls.handshake.extensions_length"),
      registrar.field("tls.extension"),
      registrar.field("tls.extension.type"),
      registrar.field("tls.extension.length"),
      registrar.field("tls.extension.data"),
      registrar.field("tls.handshake.server_name_type"),
      registrar.field("tls.handshake.server_name"),
      registrar.field("tls.handshake.alpn"),
      registrar.field("tls.handshake.supported_group"),
      registrar.field("tls.handshake.signature_algorithm"),
      registrar.field("tls.handshake.supported_version"),
      registrar.field("tls.handshake.body"),
      registrar.field("tls.handshake.reassembled"),
      registrar.field("tls.trailing"),
  });
  registrar.bind_tcp_port(443, registrar.add(dissect_tls, tls));

  const auto quic = state(QuicDissectorState{
      registrar.field("quic.packet"),
      registrar.field("quic.packet_type"),
      registrar.field("quic.packet_length"),
      registrar.field("quic.coalesced_index"),
      registrar.field("quic.header_form"),
      registrar.field("quic.fixed_bit"),
      registrar.field("quic.long_packet_type_bits"),
      registrar.field("quic.type_specific_bits"),
      registrar.field("quic.version"),
      registrar.field("quic.destination_connection_id_length"),
      registrar.field("quic.destination_connection_id"),
      registrar.field("quic.source_connection_id_length"),
      registrar.field("quic.source_connection_id"),
      registrar.field("quic.token_length"),
      registrar.field("quic.token"),
      registrar.field("quic.length"),
      registrar.field("quic.protected_payload"),
      registrar.field("quic.supported_version"),
      registrar.field("quic.retry_token"),
      registrar.field("quic.retry_integrity_tag"),
      registrar.field("quic.spin_bit"),
      registrar.field("quic.short_protected_bits"),
      registrar.field("quic.version_specific_data"),
  });
  registrar.bind_udp_port(443, registrar.add(dissect_quic, quic));

  const auto dhcp = state(DhcpDissectorState{
      registrar.field("dhcp.message"),
      registrar.field("dhcp.operation"),
      registrar.field("dhcp.hardware_type"),
      registrar.field("dhcp.hardware_length"),
      registrar.field("dhcp.hops"),
      registrar.field("dhcp.transaction_id"),
      registrar.field("dhcp.seconds"),
      registrar.field("dhcp.flags"),
      registrar.field("dhcp.broadcast"),
      registrar.field("dhcp.client_address"),
      registrar.field("dhcp.your_address"),
      registrar.field("dhcp.server_address"),
      registrar.field("dhcp.relay_address"),
      registrar.field("dhcp.client_hardware_address"),
      registrar.field("dhcp.client_hardware_padding"),
      registrar.field("dhcp.server_name"),
      registrar.field("dhcp.boot_file"),
      registrar.field("dhcp.magic_cookie"),
      registrar.field("dhcp.option"),
      registrar.field("dhcp.option.code"),
      registrar.field("dhcp.option.length"),
      registrar.field("dhcp.option.data"),
      registrar.field("dhcp.message_type"),
      registrar.field("dhcp.subnet_mask"),
      registrar.field("dhcp.router"),
      registrar.field("dhcp.dns_server"),
      registrar.field("dhcp.host_name"),
      registrar.field("dhcp.domain_name"),
      registrar.field("dhcp.requested_address"),
      registrar.field("dhcp.lease_time"),
      registrar.field("dhcp.server_identifier"),
      registrar.field("dhcp.parameter_request"),
      registrar.field("dhcp.maximum_message_size"),
      registrar.field("dhcp.renewal_time"),
      registrar.field("dhcp.rebinding_time"),
      registrar.field("dhcp.vendor_class"),
      registrar.field("dhcp.client_identifier"),
      registrar.field("dhcp.overload"),
      registrar.field("dhcp.relay_suboption"),
      registrar.field("dhcp.relay_suboption.code"),
      registrar.field("dhcp.relay_suboption.length"),
      registrar.field("dhcp.relay_suboption.data"),
      registrar.field("dhcp.end"),
      registrar.field("dhcp.padding"),
      registrar.field("dhcp.trailing"),
  });
  const auto dhcp_handle = registrar.add(dissect_dhcp, dhcp);
  registrar.bind_udp_port(67, dhcp_handle);
  registrar.bind_udp_port(68, dhcp_handle);

  const auto dhcpv6 = state(Dhcpv6DissectorState{
      registrar.field("dhcpv6.message"),
      registrar.field("dhcpv6.message_type"),
      registrar.field("dhcpv6.transaction_id"),
      registrar.field("dhcpv6.hop_count"),
      registrar.field("dhcpv6.link_address"),
      registrar.field("dhcpv6.peer_address"),
      registrar.field("dhcpv6.option"),
      registrar.field("dhcpv6.option.code"),
      registrar.field("dhcpv6.option.length"),
      registrar.field("dhcpv6.option.data"),
      registrar.field("dhcpv6.duid"),
      registrar.field("dhcpv6.duid.type"),
      registrar.field("dhcpv6.duid.hardware_type"),
      registrar.field("dhcpv6.duid.time"),
      registrar.field("dhcpv6.duid.enterprise"),
      registrar.field("dhcpv6.duid.identifier"),
      registrar.field("dhcpv6.iaid"),
      registrar.field("dhcpv6.t1"),
      registrar.field("dhcpv6.t2"),
      registrar.field("dhcpv6.address"),
      registrar.field("dhcpv6.preferred_lifetime"),
      registrar.field("dhcpv6.valid_lifetime"),
      registrar.field("dhcpv6.prefix_length"),
      registrar.field("dhcpv6.prefix"),
      registrar.field("dhcpv6.requested_option"),
      registrar.field("dhcpv6.preference"),
      registrar.field("dhcpv6.elapsed_time"),
      registrar.field("dhcpv6.status_code"),
      registrar.field("dhcpv6.status_message"),
      registrar.field("dhcpv6.dns_server"),
      registrar.field("dhcpv6.domain_search"),
      registrar.field("dhcpv6.relay_message"),
      registrar.field("dhcpv6.interface_id"),
      registrar.field("dhcpv6.rapid_commit"),
      registrar.field("dhcpv6.information_refresh_time"),
      registrar.field("dhcpv6.sol_max_rt"),
      registrar.field("dhcpv6.inf_max_rt"),
      registrar.field("dhcpv6.trailing"),
  });
  const auto dhcpv6_handle = registrar.add(dissect_dhcpv6, dhcpv6);
  registrar.bind_udp_port(546, dhcpv6_handle);
  registrar.bind_udp_port(547, dhcpv6_handle);

  const auto ntp = state(NtpDissectorState{
      registrar.field("ntp.message"),
      registrar.field("ntp.flags"),
      registrar.field("ntp.leap_indicator"),
      registrar.field("ntp.version"),
      registrar.field("ntp.mode"),
      registrar.field("ntp.stratum"),
      registrar.field("ntp.poll"),
      registrar.field("ntp.precision"),
      registrar.field("ntp.root_delay"),
      registrar.field("ntp.root_dispersion"),
      registrar.field("ntp.reference_id"),
      registrar.field("ntp.reference_timestamp"),
      registrar.field("ntp.origin_timestamp"),
      registrar.field("ntp.receive_timestamp"),
      registrar.field("ntp.transmit_timestamp"),
      registrar.field("ntp.extension"),
      registrar.field("ntp.extension.type"),
      registrar.field("ntp.extension.length"),
      registrar.field("ntp.extension.value"),
      registrar.field("ntp.key_id"),
      registrar.field("ntp.digest"),
      registrar.field("ntp.control.flags"),
      registrar.field("ntp.control.response"),
      registrar.field("ntp.control.error"),
      registrar.field("ntp.control.more"),
      registrar.field("ntp.control.opcode"),
      registrar.field("ntp.control.sequence"),
      registrar.field("ntp.control.status"),
      registrar.field("ntp.control.association_id"),
      registrar.field("ntp.control.offset"),
      registrar.field("ntp.control.count"),
      registrar.field("ntp.control.data"),
      registrar.field("ntp.private.flags"),
      registrar.field("ntp.private.response"),
      registrar.field("ntp.private.more"),
      registrar.field("ntp.private.authenticated"),
      registrar.field("ntp.private.sequence"),
      registrar.field("ntp.private.implementation"),
      registrar.field("ntp.private.request_code"),
      registrar.field("ntp.private.error_code"),
      registrar.field("ntp.private.item_count"),
      registrar.field("ntp.private.item_size"),
      registrar.field("ntp.private.data"),
      registrar.field("ntp.trailing"),
  });
  registrar.bind_udp_port(123, registrar.add(dissect_ntp, ntp));

  const auto mpls = state(MplsDissectorState{
      registrar.field("mpls.packet"),
      registrar.field("mpls.entry"),
      registrar.field("mpls.label"),
      registrar.field("mpls.traffic_class"),
      registrar.field("mpls.bottom_of_stack"),
      registrar.field("mpls.ttl"),
      registrar.field("mpls.payload_protocol"),
      registrar.field("mpls.gach"),
      registrar.field("mpls.gach.channel_indicator"),
      registrar.field("mpls.gach.version"),
      registrar.field("mpls.gach.reserved"),
      registrar.field("mpls.gach.channel_type"),
      registrar.field("mpls.payload"),
  });
  const auto mpls_handle = registrar.add(dissect_mpls, mpls);
  registrar.bind_ethertype(0x8847, mpls_handle);
  registrar.bind_ethertype(0x8848, mpls_handle);
  registrar.bind_ip_protocol(IpFamily::V4, 137, mpls_handle);
  registrar.bind_ip_protocol(IpFamily::V6, 137, mpls_handle);
  registrar.bind_udp_port(6635, mpls_handle);

  const auto gre = state(GreDissectorState{
      registrar.field("gre.packet"),
      registrar.field("gre.flags"),
      registrar.field("gre.checksum_present"),
      registrar.field("gre.routing_present"),
      registrar.field("gre.key_present"),
      registrar.field("gre.sequence_present"),
      registrar.field("gre.strict_source_route"),
      registrar.field("gre.recursion_control"),
      registrar.field("gre.acknowledgment_present"),
      registrar.field("gre.reserved"),
      registrar.field("gre.version"),
      registrar.field("gre.protocol_type"),
      registrar.field("gre.checksum"),
      registrar.field("gre.checksum_valid"),
      registrar.field("gre.offset"),
      registrar.field("gre.key"),
      registrar.field("gre.sequence_number"),
      registrar.field("gre.payload_length"),
      registrar.field("gre.call_id"),
      registrar.field("gre.acknowledgment_number"),
      registrar.field("gre.routing_entry"),
      registrar.field("gre.routing.address_family"),
      registrar.field("gre.routing.offset"),
      registrar.field("gre.routing.length"),
      registrar.field("gre.routing.information"),
  });
  const auto gre_handle = registrar.add(dissect_gre, gre);
  registrar.bind_ip_protocol(IpFamily::V4, 47, gre_handle);
  registrar.bind_ip_protocol(IpFamily::V6, 47, gre_handle);
  registrar.bind_ethertype(0x6558, link_handles.ethernet);

  const auto vxlan_standard = state(VxlanDissectorState{
      registrar.field("vxlan.packet"),
      registrar.field("vxlan.flags"),
      registrar.field("vxlan.version"),
      registrar.field("vxlan.instance"),
      registrar.field("vxlan.next_protocol_present"),
      registrar.field("vxlan.oam"),
      registrar.field("vxlan.group_policy_present"),
      registrar.field("vxlan.vni_present"),
      registrar.field("vxlan.dont_learn"),
      registrar.field("vxlan.policy_applied"),
      registrar.field("vxlan.reserved_flags"),
      registrar.field("vxlan.group_policy_id"),
      registrar.field("vxlan.reserved_16"),
      registrar.field("vxlan.next_protocol"),
      registrar.field("vxlan.vni"),
      registrar.field("vxlan.reserved_8"),
      VxlanFlavor::Standard,
  });
  const auto vxlan_gpe = state(VxlanDissectorState{
      registrar.field("vxlan.packet"),
      registrar.field("vxlan.flags"),
      registrar.field("vxlan.version"),
      registrar.field("vxlan.instance"),
      registrar.field("vxlan.next_protocol_present"),
      registrar.field("vxlan.oam"),
      registrar.field("vxlan.group_policy_present"),
      registrar.field("vxlan.vni_present"),
      registrar.field("vxlan.dont_learn"),
      registrar.field("vxlan.policy_applied"),
      registrar.field("vxlan.reserved_flags"),
      registrar.field("vxlan.group_policy_id"),
      registrar.field("vxlan.reserved_16"),
      registrar.field("vxlan.next_protocol"),
      registrar.field("vxlan.vni"),
      registrar.field("vxlan.reserved_8"),
      VxlanFlavor::Gpe,
  });
  const auto vxlan_standard_handle =
      registrar.add(dissect_vxlan, vxlan_standard);
  registrar.bind_udp_port(4789, vxlan_standard_handle);
  registrar.bind_udp_port(8472, vxlan_standard_handle);
  registrar.bind_udp_port(4790, registrar.add(dissect_vxlan, vxlan_gpe));

  const auto geneve = state(GeneveDissectorState{
      registrar.field("geneve.packet"),
      registrar.field("geneve.version"),
      registrar.field("geneve.option_length"),
      registrar.field("geneve.flags"),
      registrar.field("geneve.oam"),
      registrar.field("geneve.critical_options"),
      registrar.field("geneve.reserved_flags"),
      registrar.field("geneve.protocol_type"),
      registrar.field("geneve.vni"),
      registrar.field("geneve.reserved"),
      registrar.field("geneve.option"),
      registrar.field("geneve.option.class"),
      registrar.field("geneve.option.type"),
      registrar.field("geneve.option.critical"),
      registrar.field("geneve.option.reserved"),
      registrar.field("geneve.option.data_length"),
      registrar.field("geneve.option.data"),
  });
  registrar.bind_udp_port(6081, registrar.add(dissect_geneve, geneve));
}

std::uint16_t
DissectorCatalog::add_handle(DissectorFunction function,
                             std::shared_ptr<const void> state_owner) {
  if (function == nullptr || !state_owner ||
      handles_.size() >= std::numeric_limits<std::uint16_t>::max()) {
    throw std::logic_error(
        "Invalid or excessive dissector handle registration.");
  }
  states_.push_back(std::move(state_owner));
  handles_.push_back({function, states_.back().get()});
  return static_cast<std::uint16_t>(handles_.size() - 1);
}

void DissectorCatalog::bind_dlt(std::uint32_t selector,
                                std::uint16_t handle_index) {
  const auto found =
      std::lower_bound(dlt_.begin(), dlt_.end(), selector,
                       [](const auto &entry, std::uint32_t value) {
                         return entry.first < value;
                       });
  if (found != dlt_.end() && found->first == selector) {
    throw std::logic_error("Duplicate DLT dissector registration.");
  }
  dlt_.insert(found, {selector, handle_index});
}

void DissectorCatalog::bind_ethertype(std::uint16_t selector,
                                      std::uint16_t handle_index) {
  if (ethertype_[selector] != 0) {
    throw std::logic_error("Duplicate EtherType dissector registration.");
  }
  ethertype_[selector] = handle_index;
}

void DissectorCatalog::bind_ip_protocol(IpFamily family, std::uint8_t selector,
                                        std::uint16_t handle_index) {
  auto &table = family == IpFamily::V4 ? ipv4_protocol_ : ipv6_next_header_;
  if (table[selector] != 0) {
    throw std::logic_error("Duplicate IP protocol dissector registration.");
  }
  table[selector] = handle_index;
}

void DissectorCatalog::bind_sll_protocol(std::uint16_t selector,
                                         std::uint16_t handle_index) {
  const auto found =
      std::lower_bound(sll_protocol_.begin(), sll_protocol_.end(), selector,
                       [](const auto &entry, std::uint16_t value) {
                         return entry.first < value;
                       });
  if (found != sll_protocol_.end() && found->first == selector) {
    throw std::logic_error(
        "Duplicate Linux cooked protocol dissector registration.");
  }
  sll_protocol_.insert(found, {selector, handle_index});
}

void DissectorCatalog::bind_null_family(std::uint32_t selector,
                                        std::uint16_t handle_index) {
  const auto found =
      std::lower_bound(null_family_.begin(), null_family_.end(), selector,
                       [](const auto &entry, std::uint32_t value) {
                         return entry.first < value;
                       });
  if (found != null_family_.end() && found->first == selector) {
    throw std::logic_error(
        "Duplicate Null/Loopback family dissector registration.");
  }
  null_family_.insert(found, {selector, handle_index});
}

void DissectorCatalog::bind_llc_sap(std::uint8_t selector,
                                    std::uint16_t handle_index) {
  if (llc_sap_[selector] != 0) {
    throw std::logic_error("Duplicate LLC SAP dissector registration.");
  }
  llc_sap_[selector] = handle_index;
}

void DissectorCatalog::bind_snap_pid(std::uint32_t oui, std::uint16_t pid,
                                     std::uint16_t handle_index) {
  const auto selector = snap_key(oui, pid);
  const auto found =
      std::lower_bound(snap_pid_.begin(), snap_pid_.end(), selector,
                       [](const auto &entry, std::uint64_t value) {
                         return entry.first < value;
                       });
  if (found != snap_pid_.end() && found->first == selector) {
    throw std::logic_error("Duplicate SNAP PID dissector registration.");
  }
  snap_pid_.insert(found, {selector, handle_index});
}

void DissectorCatalog::bind_udp_port(std::uint16_t selector,
                                     std::uint16_t handle_index) {
  if (udp_port_[selector] != 0) {
    throw std::logic_error("Duplicate UDP port dissector registration.");
  }
  udp_port_[selector] = handle_index;
}

void DissectorCatalog::bind_tcp_port(std::uint16_t selector,
                                     std::uint16_t handle_index) {
  if (tcp_port_[selector] != 0) {
    throw std::logic_error("Duplicate TCP port dissector registration.");
  }
  tcp_port_[selector] = handle_index;
}

DissectorHandle DissectorCatalog::handle(std::uint16_t index) const noexcept {
  return index < handles_.size() ? handles_[index] : DissectorHandle{};
}

const RegistrySnapshotPtr &DissectorCatalog::registry() const noexcept {
  return registry_;
}

FieldId DissectorCatalog::root_frame_field() const noexcept {
  return root_frame_;
}

FieldId DissectorCatalog::unknown_data_field() const noexcept {
  return unknown_data_;
}

DissectorHandle DissectorCatalog::root() const noexcept {
  return handle(root_);
}

DissectorHandle DissectorCatalog::dlt(std::uint32_t value) const noexcept {
  const auto found =
      std::lower_bound(dlt_.begin(), dlt_.end(), value,
                       [](const auto &entry, std::uint32_t selector) {
                         return entry.first < selector;
                       });
  return found != dlt_.end() && found->first == value ? handle(found->second)
                                                      : DissectorHandle{};
}

DissectorHandle DissectorCatalog::ethernet() const noexcept {
  return handle(ethernet_);
}

DissectorHandle
DissectorCatalog::ethertype(std::uint16_t value) const noexcept {
  return handle(ethertype_[value]);
}

DissectorHandle
DissectorCatalog::ip_protocol(IpFamily family,
                              std::uint8_t value) const noexcept {
  return handle(family == IpFamily::V4 ? ipv4_protocol_[value]
                                       : ipv6_next_header_[value]);
}

DissectorHandle
DissectorCatalog::sll_protocol(std::uint16_t,
                               std::uint16_t protocol) const noexcept {
  const auto found =
      std::lower_bound(sll_protocol_.begin(), sll_protocol_.end(), protocol,
                       [](const auto &entry, std::uint16_t value) {
                         return entry.first < value;
                       });
  return found != sll_protocol_.end() && found->first == protocol
             ? handle(found->second)
             : DissectorHandle{};
}

DissectorHandle
DissectorCatalog::null_family(std::uint32_t value) const noexcept {
  const auto found =
      std::lower_bound(null_family_.begin(), null_family_.end(), value,
                       [](const auto &entry, std::uint32_t selector) {
                         return entry.first < selector;
                       });
  return found != null_family_.end() && found->first == value
             ? handle(found->second)
             : DissectorHandle{};
}

DissectorHandle DissectorCatalog::llc() const noexcept { return handle(llc_); }

DissectorHandle DissectorCatalog::snap(bool information_frame) const noexcept {
  return handle(information_frame ? snap_information_ : snap_non_information_);
}

DissectorHandle DissectorCatalog::llc_sap(std::uint8_t value) const noexcept {
  return handle(llc_sap_[value]);
}

DissectorHandle DissectorCatalog::snap_pid(std::uint32_t oui,
                                           std::uint16_t pid) const noexcept {
  const auto selector = snap_key(oui, pid);
  const auto found =
      std::lower_bound(snap_pid_.begin(), snap_pid_.end(), selector,
                       [](const auto &entry, std::uint64_t value) {
                         return entry.first < value;
                       });
  return found != snap_pid_.end() && found->first == selector
             ? handle(found->second)
             : DissectorHandle{};
}

DissectorHandle DissectorCatalog::udp_port(std::uint16_t value) const noexcept {
  return handle(udp_port_[value]);
}

DissectorHandle DissectorCatalog::tcp_port(std::uint16_t value) const noexcept {
  return handle(tcp_port_[value]);
}

DissectorCatalogPtr make_core_dissector_catalog(RegistrySnapshotPtr registry) {
  return std::make_shared<const DissectorCatalog>(std::move(registry));
}

} // namespace pruftnet::parsing::internal

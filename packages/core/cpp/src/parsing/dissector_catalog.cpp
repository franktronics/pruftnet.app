#include "parsing/dissector_catalog.hpp"

#include <algorithm>
#include <limits>
#include <stdexcept>
#include <string>
#include <string_view>
#include <variant>

#include "parsing/core_link_types.hpp"
#include "parsing/dissectors/application/dhcp_dissector.hpp"
#include "parsing/dissectors/application/dhcpv6_dissector.hpp"
#include "parsing/dissectors/application/dns_dissector.hpp"
#include "parsing/dissectors/application/http_dissector.hpp"
#include "parsing/dissectors/application/ntp_dissector.hpp"
#include "parsing/dissectors/application/quic_dissector.hpp"
#include "parsing/dissectors/application/tls_dissector.hpp"
#include "parsing/dissectors/link/ethernet_dissector.hpp"
#include "parsing/dissectors/link/frame_dissector.hpp"
#include "parsing/dissectors/link/linux_cooked_dissector.hpp"
#include "parsing/dissectors/link/llc_dissector.hpp"
#include "parsing/dissectors/link/lldp_dissector.hpp"
#include "parsing/dissectors/link/null_loopback_dissector.hpp"
#include "parsing/dissectors/link/raw_dissector.hpp"
#include "parsing/dissectors/link/snap_dissector.hpp"
#include "parsing/dissectors/link/stp_dissector.hpp"
#include "parsing/dissectors/link/vlan_dissector.hpp"
#include "parsing/dissectors/network/arp_dissector.hpp"
#include "parsing/dissectors/network/icmp_extension.hpp"
#include "parsing/dissectors/network/icmpv4_dissector.hpp"
#include "parsing/dissectors/network/icmpv6_dissector.hpp"
#include "parsing/dissectors/network/igmp_dissector.hpp"
#include "parsing/dissectors/network/ipv4_dissector.hpp"
#include "parsing/dissectors/network/ipv6_dissector.hpp"
#include "parsing/dissectors/network/mld_dissector.hpp"
#include "parsing/dissectors/transport/tcp_dissector.hpp"
#include "parsing/dissectors/transport/udp_dissector.hpp"
#include "parsing/dissectors/tunnel/geneve_dissector.hpp"
#include "parsing/dissectors/tunnel/gre_dissector.hpp"
#include "parsing/dissectors/tunnel/mpls_dissector.hpp"
#include "parsing/dissectors/tunnel/vxlan_dissector.hpp"

namespace pruftnet::parsing::internal {
namespace {

FieldId resolve_field(const RegistrySnapshot &registry, std::string_view key) {
  const auto result = registry.field(key);
  if (const auto *descriptor =
          std::get_if<std::reference_wrapper<const FieldDescriptor>>(&result)) {
    return descriptor->get().id;
  }
  throw std::logic_error("The core dissector catalog is missing field " +
                         std::string(key));
}

template <typename State> std::shared_ptr<const State> state(State value) {
  return std::make_shared<const State>(std::move(value));
}

std::uint64_t snap_key(std::uint32_t oui, std::uint16_t pid) noexcept {
  return (static_cast<std::uint64_t>(oui) << 16U) | pid;
}

IcmpExtensionDissectorState
icmp_extension_state(const RegistrySnapshot &registry) {
  return {
      resolve_field(registry, "icmp_ext.structure"),
      resolve_field(registry, "icmp_ext.version"),
      resolve_field(registry, "icmp_ext.reserved"),
      resolve_field(registry, "icmp_ext.checksum"),
      resolve_field(registry, "icmp_ext.checksum_valid"),
      resolve_field(registry, "icmp_ext.object"),
      resolve_field(registry, "icmp_ext.object.length"),
      resolve_field(registry, "icmp_ext.object.class"),
      resolve_field(registry, "icmp_ext.object.ctype"),
      resolve_field(registry, "icmp_ext.object.data"),
      resolve_field(registry, "icmp_ext.mpls_entry"),
      resolve_field(registry, "icmp_ext.mpls_label"),
      resolve_field(registry, "icmp_ext.mpls_traffic_class"),
      resolve_field(registry, "icmp_ext.mpls_bottom_of_stack"),
      resolve_field(registry, "icmp_ext.mpls_ttl"),
  };
}

DnsDissectorState dns_state(const RegistrySnapshot &registry,
                            std::string_view message_key, DnsFlavor flavor,
                            bool tcp) {
  return {
      resolve_field(registry, message_key),
      resolve_field(registry, "dns.tcp_stream"),
      resolve_field(registry, "dns.tcp_length"),
      resolve_field(registry, "dns.id"),
      resolve_field(registry, "dns.flags"),
      resolve_field(registry, "dns.response"),
      resolve_field(registry, "dns.opcode"),
      resolve_field(registry, "dns.authoritative"),
      resolve_field(registry, "dns.truncated"),
      resolve_field(registry, "dns.recursion_desired"),
      resolve_field(registry, "dns.recursion_available"),
      resolve_field(registry, "dns.authenticated_data"),
      resolve_field(registry, "dns.checking_disabled"),
      resolve_field(registry, "dns.rcode"),
      resolve_field(registry, "llmnr.conflict"),
      resolve_field(registry, "llmnr.tentative"),
      resolve_field(registry, "dns.question_count"),
      resolve_field(registry, "dns.answer_count"),
      resolve_field(registry, "dns.authority_count"),
      resolve_field(registry, "dns.additional_count"),
      resolve_field(registry, "dns.question"),
      resolve_field(registry, "dns.question.name"),
      resolve_field(registry, "dns.question.type"),
      resolve_field(registry, "dns.question.class"),
      resolve_field(registry, "mdns.question.unicast_response"),
      resolve_field(registry, "dns.record"),
      resolve_field(registry, "dns.record.section"),
      resolve_field(registry, "dns.record.name"),
      resolve_field(registry, "dns.record.type"),
      resolve_field(registry, "dns.record.class"),
      resolve_field(registry, "mdns.record.cache_flush"),
      resolve_field(registry, "dns.record.ttl"),
      resolve_field(registry, "dns.record.length"),
      resolve_field(registry, "dns.record.data"),
      resolve_field(registry, "dns.address"),
      resolve_field(registry, "dns.target"),
      resolve_field(registry, "dns.preference"),
      resolve_field(registry, "dns.priority"),
      resolve_field(registry, "dns.weight"),
      resolve_field(registry, "dns.port"),
      resolve_field(registry, "dns.text"),
      resolve_field(registry, "dns.soa.mname"),
      resolve_field(registry, "dns.soa.rname"),
      resolve_field(registry, "dns.soa.serial"),
      resolve_field(registry, "dns.soa.refresh"),
      resolve_field(registry, "dns.soa.retry"),
      resolve_field(registry, "dns.soa.expire"),
      resolve_field(registry, "dns.soa.minimum"),
      resolve_field(registry, "dns.edns.udp_payload_size"),
      resolve_field(registry, "dns.edns.extended_rcode"),
      resolve_field(registry, "dns.edns.version"),
      resolve_field(registry, "dns.edns.flags"),
      resolve_field(registry, "dns.edns.option"),
      resolve_field(registry, "dns.edns.option.code"),
      resolve_field(registry, "dns.edns.option.length"),
      resolve_field(registry, "dns.edns.option.data"),
      resolve_field(registry, "dns.trailing"),
      flavor,
      tcp,
  };
}

MldDissectorState mld_state(const RegistrySnapshot &registry) {
  return {
      resolve_field(registry, "mld.message"),
      resolve_field(registry, "mld.version"),
      resolve_field(registry, "mld.maximum_response_code"),
      resolve_field(registry, "mld.maximum_response_delay"),
      resolve_field(registry, "mld.reserved"),
      resolve_field(registry, "mld.multicast_address"),
      resolve_field(registry, "mld.flags"),
      resolve_field(registry, "mld.suppress"),
      resolve_field(registry, "mld.qrv"),
      resolve_field(registry, "mld.qqic"),
      resolve_field(registry, "mld.query_interval"),
      resolve_field(registry, "mld.source_count"),
      resolve_field(registry, "mld.source_address"),
      resolve_field(registry, "mld.record_count"),
      resolve_field(registry, "mld.record"),
      resolve_field(registry, "mld.record.type"),
      resolve_field(registry, "mld.record.aux_data_length"),
      resolve_field(registry, "mld.record.source_count"),
      resolve_field(registry, "mld.record.multicast_address"),
      resolve_field(registry, "mld.record.source_address"),
      resolve_field(registry, "mld.record.aux_data"),
      resolve_field(registry, "mld.trailing"),
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
  common_ = state(CommonDissectorState{
      resolve_field(*registry_, "root.frame"),
      resolve_field(*registry_, "root.captured_length"),
      resolve_field(*registry_, "root.reported_length"),
      resolve_field(*registry_, "root.link_type"),
      resolve_field(*registry_, "unknown.data"),
  });
  root_ = add_handle(dissect_frame, common_);

  const auto ethernet = state(EthernetDissectorState{
      resolve_field(*registry_, "eth.frame"),
      resolve_field(*registry_, "eth.destination"),
      resolve_field(*registry_, "eth.source"),
      resolve_field(*registry_, "eth.type"),
      resolve_field(*registry_, "eth.trailer"),
  });
  const auto ethernet_handle = add_handle(dissect_ethernet, ethernet);
  ethernet_ = ethernet_handle;

  const auto ipv4 = state(Ipv4DissectorState{
      resolve_field(*registry_, "ipv4.packet"),
      resolve_field(*registry_, "ipv4.version"),
      resolve_field(*registry_, "ipv4.header_length"),
      resolve_field(*registry_, "ipv4.dscp_ecn"),
      resolve_field(*registry_, "ipv4.total_length"),
      resolve_field(*registry_, "ipv4.identification"),
      resolve_field(*registry_, "ipv4.flags"),
      resolve_field(*registry_, "ipv4.reserved_flag"),
      resolve_field(*registry_, "ipv4.dont_fragment"),
      resolve_field(*registry_, "ipv4.more_fragments"),
      resolve_field(*registry_, "ipv4.fragment_offset_encoded"),
      resolve_field(*registry_, "ipv4.fragment_offset"),
      resolve_field(*registry_, "ipv4.reassembled"),
      resolve_field(*registry_, "ipv4.reassembled_length"),
      resolve_field(*registry_, "ipv4.reassembled_fragment_count"),
      resolve_field(*registry_, "ipv4.fragment_overlap"),
      resolve_field(*registry_, "ipv4.ttl"),
      resolve_field(*registry_, "ipv4.protocol"),
      resolve_field(*registry_, "ipv4.checksum"),
      resolve_field(*registry_, "ipv4.source"),
      resolve_field(*registry_, "ipv4.destination"),
      resolve_field(*registry_, "ipv4.options"),
  });
  const auto ipv4_handle = add_handle(dissect_ipv4, ipv4);
  bind_ethertype(0x0800, ipv4_handle);

  const auto udp = state(UdpDissectorState{
      resolve_field(*registry_, "udp.datagram"),
      resolve_field(*registry_, "udp.source_port"),
      resolve_field(*registry_, "udp.destination_port"),
      resolve_field(*registry_, "udp.length"),
      resolve_field(*registry_, "udp.checksum"),
      resolve_field(*registry_, "udp.payload"),
  });
  const auto udp_handle = add_handle(dissect_udp, udp);
  bind_ip_protocol(IpFamily::V4, 17, udp_handle);
  bind_ip_protocol(IpFamily::V6, 17, udp_handle);

  const auto vlan = state(VlanDissectorState{
      resolve_field(*registry_, "vlan.tag"),
      resolve_field(*registry_, "vlan.priority"),
      resolve_field(*registry_, "vlan.dei"),
      resolve_field(*registry_, "vlan.id"),
      resolve_field(*registry_, "vlan.type"),
      resolve_field(*registry_, "vlan.trailer"),
  });
  const auto vlan_handle = add_handle(dissect_vlan, vlan);
  bind_ethertype(0x8100, vlan_handle);
  bind_ethertype(0x88a8, vlan_handle);

  const auto tcp = state(TcpDissectorState{
      resolve_field(*registry_, "tcp.segment"),
      resolve_field(*registry_, "tcp.source_port"),
      resolve_field(*registry_, "tcp.destination_port"),
      resolve_field(*registry_, "tcp.sequence_number"),
      resolve_field(*registry_, "tcp.acknowledgment_number"),
      resolve_field(*registry_, "tcp.header_length"),
      resolve_field(*registry_, "tcp.reserved"),
      resolve_field(*registry_, "tcp.flags"),
      resolve_field(*registry_, "tcp.window"),
      resolve_field(*registry_, "tcp.checksum"),
      resolve_field(*registry_, "tcp.urgent_pointer"),
      resolve_field(*registry_, "tcp.options"),
      resolve_field(*registry_, "tcp.payload"),
      resolve_field(*registry_, "tcp.reassembled"),
      resolve_field(*registry_, "tcp.reassembled_length"),
      resolve_field(*registry_, "tcp.reassembled_segment_count"),
      resolve_field(*registry_, "tcp.reassembly_overlap"),
      resolve_field(*registry_, "tcp.reassembly_conflict"),
  });
  const auto tcp_handle = add_handle(dissect_tcp, tcp);
  bind_ip_protocol(IpFamily::V4, 6, tcp_handle);
  bind_ip_protocol(IpFamily::V6, 6, tcp_handle);

  const auto dns_udp =
      state(dns_state(*registry_, "dns.message", DnsFlavor::Dns, false));
  const auto dns_tcp =
      state(dns_state(*registry_, "dns.message", DnsFlavor::Dns, true));
  const auto mdns_udp =
      state(dns_state(*registry_, "mdns.message", DnsFlavor::Mdns, false));
  const auto llmnr_udp =
      state(dns_state(*registry_, "llmnr.message", DnsFlavor::Llmnr, false));
  const auto llmnr_tcp =
      state(dns_state(*registry_, "llmnr.message", DnsFlavor::Llmnr, true));
  bind_udp_port(53, add_handle(dissect_dns, dns_udp));
  bind_tcp_port(53, add_handle(dissect_dns, dns_tcp));
  bind_udp_port(5353, add_handle(dissect_dns, mdns_udp));
  bind_udp_port(5355, add_handle(dissect_dns, llmnr_udp));
  bind_tcp_port(5355, add_handle(dissect_dns, llmnr_tcp));

  const auto http = state(HttpDissectorState{
      resolve_field(*registry_, "http.stream"),
      resolve_field(*registry_, "http.message"),
      resolve_field(*registry_, "http.request"),
      resolve_field(*registry_, "http.response"),
      resolve_field(*registry_, "http.request_line"),
      resolve_field(*registry_, "http.response_line"),
      resolve_field(*registry_, "http.method"),
      resolve_field(*registry_, "http.request_target"),
      resolve_field(*registry_, "http.version"),
      resolve_field(*registry_, "http.status_code"),
      resolve_field(*registry_, "http.reason_phrase"),
      resolve_field(*registry_, "http.header"),
      resolve_field(*registry_, "http.header.name"),
      resolve_field(*registry_, "http.header.value"),
      resolve_field(*registry_, "http.host"),
      resolve_field(*registry_, "http.user_agent"),
      resolve_field(*registry_, "http.content_type"),
      resolve_field(*registry_, "http.content_length"),
      resolve_field(*registry_, "http.transfer_encoding"),
      resolve_field(*registry_, "http.connection"),
      resolve_field(*registry_, "http.body"),
      resolve_field(*registry_, "http.chunk"),
      resolve_field(*registry_, "http.chunk.size"),
      resolve_field(*registry_, "http.chunk.extension"),
      resolve_field(*registry_, "http.chunk.data"),
      resolve_field(*registry_, "http.trailing"),
  });
  bind_tcp_port(80, add_handle(dissect_http, http));

  const auto tls = state(TlsDissectorState{
      resolve_field(*registry_, "tls.stream"),
      resolve_field(*registry_, "tls.record"),
      resolve_field(*registry_, "tls.content_type"),
      resolve_field(*registry_, "tls.legacy_version"),
      resolve_field(*registry_, "tls.length"),
      resolve_field(*registry_, "tls.record_payload"),
      resolve_field(*registry_, "tls.alert"),
      resolve_field(*registry_, "tls.alert.level"),
      resolve_field(*registry_, "tls.alert.description"),
      resolve_field(*registry_, "tls.change_cipher_spec"),
      resolve_field(*registry_, "tls.heartbeat"),
      resolve_field(*registry_, "tls.heartbeat.type"),
      resolve_field(*registry_, "tls.heartbeat.length"),
      resolve_field(*registry_, "tls.heartbeat.payload"),
      resolve_field(*registry_, "tls.handshake"),
      resolve_field(*registry_, "tls.handshake.type"),
      resolve_field(*registry_, "tls.handshake.length"),
      resolve_field(*registry_, "tls.handshake.version"),
      resolve_field(*registry_, "tls.handshake.random"),
      resolve_field(*registry_, "tls.handshake.session_id"),
      resolve_field(*registry_, "tls.handshake.cipher_suites_length"),
      resolve_field(*registry_, "tls.handshake.cipher_suite"),
      resolve_field(*registry_, "tls.handshake.compression_methods_length"),
      resolve_field(*registry_, "tls.handshake.compression_method"),
      resolve_field(*registry_, "tls.handshake.extensions_length"),
      resolve_field(*registry_, "tls.extension"),
      resolve_field(*registry_, "tls.extension.type"),
      resolve_field(*registry_, "tls.extension.length"),
      resolve_field(*registry_, "tls.extension.data"),
      resolve_field(*registry_, "tls.handshake.server_name_type"),
      resolve_field(*registry_, "tls.handshake.server_name"),
      resolve_field(*registry_, "tls.handshake.alpn"),
      resolve_field(*registry_, "tls.handshake.supported_group"),
      resolve_field(*registry_, "tls.handshake.signature_algorithm"),
      resolve_field(*registry_, "tls.handshake.supported_version"),
      resolve_field(*registry_, "tls.handshake.body"),
      resolve_field(*registry_, "tls.handshake.reassembled"),
      resolve_field(*registry_, "tls.trailing"),
  });
  bind_tcp_port(443, add_handle(dissect_tls, tls));

  const auto quic = state(QuicDissectorState{
      resolve_field(*registry_, "quic.packet"),
      resolve_field(*registry_, "quic.packet_type"),
      resolve_field(*registry_, "quic.packet_length"),
      resolve_field(*registry_, "quic.coalesced_index"),
      resolve_field(*registry_, "quic.header_form"),
      resolve_field(*registry_, "quic.fixed_bit"),
      resolve_field(*registry_, "quic.long_packet_type_bits"),
      resolve_field(*registry_, "quic.type_specific_bits"),
      resolve_field(*registry_, "quic.version"),
      resolve_field(*registry_, "quic.destination_connection_id_length"),
      resolve_field(*registry_, "quic.destination_connection_id"),
      resolve_field(*registry_, "quic.source_connection_id_length"),
      resolve_field(*registry_, "quic.source_connection_id"),
      resolve_field(*registry_, "quic.token_length"),
      resolve_field(*registry_, "quic.token"),
      resolve_field(*registry_, "quic.length"),
      resolve_field(*registry_, "quic.protected_payload"),
      resolve_field(*registry_, "quic.supported_version"),
      resolve_field(*registry_, "quic.retry_token"),
      resolve_field(*registry_, "quic.retry_integrity_tag"),
      resolve_field(*registry_, "quic.spin_bit"),
      resolve_field(*registry_, "quic.short_protected_bits"),
      resolve_field(*registry_, "quic.version_specific_data"),
  });
  bind_udp_port(443, add_handle(dissect_quic, quic));

  const auto dhcp = state(DhcpDissectorState{
      resolve_field(*registry_, "dhcp.message"),
      resolve_field(*registry_, "dhcp.operation"),
      resolve_field(*registry_, "dhcp.hardware_type"),
      resolve_field(*registry_, "dhcp.hardware_length"),
      resolve_field(*registry_, "dhcp.hops"),
      resolve_field(*registry_, "dhcp.transaction_id"),
      resolve_field(*registry_, "dhcp.seconds"),
      resolve_field(*registry_, "dhcp.flags"),
      resolve_field(*registry_, "dhcp.broadcast"),
      resolve_field(*registry_, "dhcp.client_address"),
      resolve_field(*registry_, "dhcp.your_address"),
      resolve_field(*registry_, "dhcp.server_address"),
      resolve_field(*registry_, "dhcp.relay_address"),
      resolve_field(*registry_, "dhcp.client_hardware_address"),
      resolve_field(*registry_, "dhcp.client_hardware_padding"),
      resolve_field(*registry_, "dhcp.server_name"),
      resolve_field(*registry_, "dhcp.boot_file"),
      resolve_field(*registry_, "dhcp.magic_cookie"),
      resolve_field(*registry_, "dhcp.option"),
      resolve_field(*registry_, "dhcp.option.code"),
      resolve_field(*registry_, "dhcp.option.length"),
      resolve_field(*registry_, "dhcp.option.data"),
      resolve_field(*registry_, "dhcp.message_type"),
      resolve_field(*registry_, "dhcp.subnet_mask"),
      resolve_field(*registry_, "dhcp.router"),
      resolve_field(*registry_, "dhcp.dns_server"),
      resolve_field(*registry_, "dhcp.host_name"),
      resolve_field(*registry_, "dhcp.domain_name"),
      resolve_field(*registry_, "dhcp.requested_address"),
      resolve_field(*registry_, "dhcp.lease_time"),
      resolve_field(*registry_, "dhcp.server_identifier"),
      resolve_field(*registry_, "dhcp.parameter_request"),
      resolve_field(*registry_, "dhcp.maximum_message_size"),
      resolve_field(*registry_, "dhcp.renewal_time"),
      resolve_field(*registry_, "dhcp.rebinding_time"),
      resolve_field(*registry_, "dhcp.vendor_class"),
      resolve_field(*registry_, "dhcp.client_identifier"),
      resolve_field(*registry_, "dhcp.overload"),
      resolve_field(*registry_, "dhcp.relay_suboption"),
      resolve_field(*registry_, "dhcp.relay_suboption.code"),
      resolve_field(*registry_, "dhcp.relay_suboption.length"),
      resolve_field(*registry_, "dhcp.relay_suboption.data"),
      resolve_field(*registry_, "dhcp.end"),
      resolve_field(*registry_, "dhcp.padding"),
      resolve_field(*registry_, "dhcp.trailing"),
  });
  const auto dhcp_handle = add_handle(dissect_dhcp, dhcp);
  bind_udp_port(67, dhcp_handle);
  bind_udp_port(68, dhcp_handle);

  const auto dhcpv6 = state(Dhcpv6DissectorState{
      resolve_field(*registry_, "dhcpv6.message"),
      resolve_field(*registry_, "dhcpv6.message_type"),
      resolve_field(*registry_, "dhcpv6.transaction_id"),
      resolve_field(*registry_, "dhcpv6.hop_count"),
      resolve_field(*registry_, "dhcpv6.link_address"),
      resolve_field(*registry_, "dhcpv6.peer_address"),
      resolve_field(*registry_, "dhcpv6.option"),
      resolve_field(*registry_, "dhcpv6.option.code"),
      resolve_field(*registry_, "dhcpv6.option.length"),
      resolve_field(*registry_, "dhcpv6.option.data"),
      resolve_field(*registry_, "dhcpv6.duid"),
      resolve_field(*registry_, "dhcpv6.duid.type"),
      resolve_field(*registry_, "dhcpv6.duid.hardware_type"),
      resolve_field(*registry_, "dhcpv6.duid.time"),
      resolve_field(*registry_, "dhcpv6.duid.enterprise"),
      resolve_field(*registry_, "dhcpv6.duid.identifier"),
      resolve_field(*registry_, "dhcpv6.iaid"),
      resolve_field(*registry_, "dhcpv6.t1"),
      resolve_field(*registry_, "dhcpv6.t2"),
      resolve_field(*registry_, "dhcpv6.address"),
      resolve_field(*registry_, "dhcpv6.preferred_lifetime"),
      resolve_field(*registry_, "dhcpv6.valid_lifetime"),
      resolve_field(*registry_, "dhcpv6.prefix_length"),
      resolve_field(*registry_, "dhcpv6.prefix"),
      resolve_field(*registry_, "dhcpv6.requested_option"),
      resolve_field(*registry_, "dhcpv6.preference"),
      resolve_field(*registry_, "dhcpv6.elapsed_time"),
      resolve_field(*registry_, "dhcpv6.status_code"),
      resolve_field(*registry_, "dhcpv6.status_message"),
      resolve_field(*registry_, "dhcpv6.dns_server"),
      resolve_field(*registry_, "dhcpv6.domain_search"),
      resolve_field(*registry_, "dhcpv6.relay_message"),
      resolve_field(*registry_, "dhcpv6.interface_id"),
      resolve_field(*registry_, "dhcpv6.rapid_commit"),
      resolve_field(*registry_, "dhcpv6.information_refresh_time"),
      resolve_field(*registry_, "dhcpv6.sol_max_rt"),
      resolve_field(*registry_, "dhcpv6.inf_max_rt"),
      resolve_field(*registry_, "dhcpv6.trailing"),
  });
  const auto dhcpv6_handle = add_handle(dissect_dhcpv6, dhcpv6);
  bind_udp_port(546, dhcpv6_handle);
  bind_udp_port(547, dhcpv6_handle);

  const auto ntp = state(NtpDissectorState{
      resolve_field(*registry_, "ntp.message"),
      resolve_field(*registry_, "ntp.flags"),
      resolve_field(*registry_, "ntp.leap_indicator"),
      resolve_field(*registry_, "ntp.version"),
      resolve_field(*registry_, "ntp.mode"),
      resolve_field(*registry_, "ntp.stratum"),
      resolve_field(*registry_, "ntp.poll"),
      resolve_field(*registry_, "ntp.precision"),
      resolve_field(*registry_, "ntp.root_delay"),
      resolve_field(*registry_, "ntp.root_dispersion"),
      resolve_field(*registry_, "ntp.reference_id"),
      resolve_field(*registry_, "ntp.reference_timestamp"),
      resolve_field(*registry_, "ntp.origin_timestamp"),
      resolve_field(*registry_, "ntp.receive_timestamp"),
      resolve_field(*registry_, "ntp.transmit_timestamp"),
      resolve_field(*registry_, "ntp.extension"),
      resolve_field(*registry_, "ntp.extension.type"),
      resolve_field(*registry_, "ntp.extension.length"),
      resolve_field(*registry_, "ntp.extension.value"),
      resolve_field(*registry_, "ntp.key_id"),
      resolve_field(*registry_, "ntp.digest"),
      resolve_field(*registry_, "ntp.control.flags"),
      resolve_field(*registry_, "ntp.control.response"),
      resolve_field(*registry_, "ntp.control.error"),
      resolve_field(*registry_, "ntp.control.more"),
      resolve_field(*registry_, "ntp.control.opcode"),
      resolve_field(*registry_, "ntp.control.sequence"),
      resolve_field(*registry_, "ntp.control.status"),
      resolve_field(*registry_, "ntp.control.association_id"),
      resolve_field(*registry_, "ntp.control.offset"),
      resolve_field(*registry_, "ntp.control.count"),
      resolve_field(*registry_, "ntp.control.data"),
      resolve_field(*registry_, "ntp.private.flags"),
      resolve_field(*registry_, "ntp.private.response"),
      resolve_field(*registry_, "ntp.private.more"),
      resolve_field(*registry_, "ntp.private.authenticated"),
      resolve_field(*registry_, "ntp.private.sequence"),
      resolve_field(*registry_, "ntp.private.implementation"),
      resolve_field(*registry_, "ntp.private.request_code"),
      resolve_field(*registry_, "ntp.private.error_code"),
      resolve_field(*registry_, "ntp.private.item_count"),
      resolve_field(*registry_, "ntp.private.item_size"),
      resolve_field(*registry_, "ntp.private.data"),
      resolve_field(*registry_, "ntp.trailing"),
  });
  bind_udp_port(123, add_handle(dissect_ntp, ntp));

  const auto igmp = state(IgmpDissectorState{
      resolve_field(*registry_, "igmp.packet"),
      resolve_field(*registry_, "igmp.type"),
      resolve_field(*registry_, "igmp.version"),
      resolve_field(*registry_, "igmp.max_response_code"),
      resolve_field(*registry_, "igmp.max_response_time"),
      resolve_field(*registry_, "igmp.checksum"),
      resolve_field(*registry_, "igmp.checksum_valid"),
      resolve_field(*registry_, "igmp.group_address"),
      resolve_field(*registry_, "igmp.reserved"),
      resolve_field(*registry_, "igmp.suppress"),
      resolve_field(*registry_, "igmp.qrv"),
      resolve_field(*registry_, "igmp.qqic"),
      resolve_field(*registry_, "igmp.query_interval"),
      resolve_field(*registry_, "igmp.source_count"),
      resolve_field(*registry_, "igmp.source_address"),
      resolve_field(*registry_, "igmp.record_count"),
      resolve_field(*registry_, "igmp.record"),
      resolve_field(*registry_, "igmp.record.type"),
      resolve_field(*registry_, "igmp.record.aux_data_length"),
      resolve_field(*registry_, "igmp.record.source_count"),
      resolve_field(*registry_, "igmp.record.multicast_address"),
      resolve_field(*registry_, "igmp.record.source_address"),
      resolve_field(*registry_, "igmp.record.aux_data"),
      resolve_field(*registry_, "igmp.trailing"),
  });
  bind_ip_protocol(IpFamily::V4, 2, add_handle(dissect_igmp, igmp));

  const auto arp = state(ArpDissectorState{
      resolve_field(*registry_, "arp.packet"),
      resolve_field(*registry_, "rarp.packet"),
      resolve_field(*registry_, "inarp.packet"),
      resolve_field(*registry_, "arp.hardware_type"),
      resolve_field(*registry_, "arp.protocol_type"),
      resolve_field(*registry_, "arp.hardware_length"),
      resolve_field(*registry_, "arp.protocol_length"),
      resolve_field(*registry_, "arp.operation"),
      resolve_field(*registry_, "arp.sender_hardware"),
      resolve_field(*registry_, "arp.sender_protocol"),
      resolve_field(*registry_, "arp.target_hardware"),
      resolve_field(*registry_, "arp.target_protocol"),
  });
  const auto arp_handle = add_handle(dissect_arp, arp);
  bind_ethertype(0x0806, arp_handle);
  bind_ethertype(0x8035, arp_handle);

  const auto ipv6 = state(Ipv6DissectorState{
      resolve_field(*registry_, "ipv6.packet"),
      resolve_field(*registry_, "ipv6.version"),
      resolve_field(*registry_, "ipv6.traffic_class"),
      resolve_field(*registry_, "ipv6.flow_label"),
      resolve_field(*registry_, "ipv6.payload_length"),
      resolve_field(*registry_, "ipv6.next_header"),
      resolve_field(*registry_, "ipv6.hop_limit"),
      resolve_field(*registry_, "ipv6.source"),
      resolve_field(*registry_, "ipv6.destination"),
      resolve_field(*registry_, "ipv6.extension"),
      resolve_field(*registry_, "ipv6.extension_next_header"),
      resolve_field(*registry_, "ipv6.extension_length"),
      resolve_field(*registry_, "ipv6.extension_type"),
      resolve_field(*registry_, "ipv6.extension_data"),
      resolve_field(*registry_, "ipv6.fragment_offset_encoded"),
      resolve_field(*registry_, "ipv6.fragment_offset"),
      resolve_field(*registry_, "ipv6.fragment_reserved_octet"),
      resolve_field(*registry_, "ipv6.fragment_reserved"),
      resolve_field(*registry_, "ipv6.fragment_more"),
      resolve_field(*registry_, "ipv6.fragment_atomic"),
      resolve_field(*registry_, "ipv6.fragment_identification"),
      resolve_field(*registry_, "ipv6.reassembled"),
      resolve_field(*registry_, "ipv6.reassembled_length"),
      resolve_field(*registry_, "ipv6.reassembled_fragment_count"),
      resolve_field(*registry_, "ipv6.fragment_overlap"),
  });
  const auto ipv6_handle = add_handle(dissect_ipv6, ipv6);
  bind_ethertype(0x86dd, ipv6_handle);

  bind_ip_protocol(IpFamily::V4, 4, ipv4_handle);
  bind_ip_protocol(IpFamily::V6, 4, ipv4_handle);
  bind_ip_protocol(IpFamily::V4, 41, ipv6_handle);
  bind_ip_protocol(IpFamily::V6, 41, ipv6_handle);

  const auto mpls = state(MplsDissectorState{
      resolve_field(*registry_, "mpls.packet"),
      resolve_field(*registry_, "mpls.entry"),
      resolve_field(*registry_, "mpls.label"),
      resolve_field(*registry_, "mpls.traffic_class"),
      resolve_field(*registry_, "mpls.bottom_of_stack"),
      resolve_field(*registry_, "mpls.ttl"),
      resolve_field(*registry_, "mpls.payload_protocol"),
      resolve_field(*registry_, "mpls.gach"),
      resolve_field(*registry_, "mpls.gach.channel_indicator"),
      resolve_field(*registry_, "mpls.gach.version"),
      resolve_field(*registry_, "mpls.gach.reserved"),
      resolve_field(*registry_, "mpls.gach.channel_type"),
      resolve_field(*registry_, "mpls.payload"),
  });
  const auto mpls_handle = add_handle(dissect_mpls, mpls);
  bind_ethertype(0x8847, mpls_handle);
  bind_ethertype(0x8848, mpls_handle);
  bind_ip_protocol(IpFamily::V4, 137, mpls_handle);
  bind_ip_protocol(IpFamily::V6, 137, mpls_handle);
  bind_udp_port(6635, mpls_handle);

  const auto gre = state(GreDissectorState{
      resolve_field(*registry_, "gre.packet"),
      resolve_field(*registry_, "gre.flags"),
      resolve_field(*registry_, "gre.checksum_present"),
      resolve_field(*registry_, "gre.routing_present"),
      resolve_field(*registry_, "gre.key_present"),
      resolve_field(*registry_, "gre.sequence_present"),
      resolve_field(*registry_, "gre.strict_source_route"),
      resolve_field(*registry_, "gre.recursion_control"),
      resolve_field(*registry_, "gre.acknowledgment_present"),
      resolve_field(*registry_, "gre.reserved"),
      resolve_field(*registry_, "gre.version"),
      resolve_field(*registry_, "gre.protocol_type"),
      resolve_field(*registry_, "gre.checksum"),
      resolve_field(*registry_, "gre.checksum_valid"),
      resolve_field(*registry_, "gre.offset"),
      resolve_field(*registry_, "gre.key"),
      resolve_field(*registry_, "gre.sequence_number"),
      resolve_field(*registry_, "gre.payload_length"),
      resolve_field(*registry_, "gre.call_id"),
      resolve_field(*registry_, "gre.acknowledgment_number"),
      resolve_field(*registry_, "gre.routing_entry"),
      resolve_field(*registry_, "gre.routing.address_family"),
      resolve_field(*registry_, "gre.routing.offset"),
      resolve_field(*registry_, "gre.routing.length"),
      resolve_field(*registry_, "gre.routing.information"),
  });
  const auto gre_handle = add_handle(dissect_gre, gre);
  bind_ip_protocol(IpFamily::V4, 47, gre_handle);
  bind_ip_protocol(IpFamily::V6, 47, gre_handle);
  bind_ethertype(0x6558, ethernet_handle);

  const auto vxlan_standard = state(VxlanDissectorState{
      resolve_field(*registry_, "vxlan.packet"),
      resolve_field(*registry_, "vxlan.flags"),
      resolve_field(*registry_, "vxlan.version"),
      resolve_field(*registry_, "vxlan.instance"),
      resolve_field(*registry_, "vxlan.next_protocol_present"),
      resolve_field(*registry_, "vxlan.oam"),
      resolve_field(*registry_, "vxlan.group_policy_present"),
      resolve_field(*registry_, "vxlan.vni_present"),
      resolve_field(*registry_, "vxlan.dont_learn"),
      resolve_field(*registry_, "vxlan.policy_applied"),
      resolve_field(*registry_, "vxlan.reserved_flags"),
      resolve_field(*registry_, "vxlan.group_policy_id"),
      resolve_field(*registry_, "vxlan.reserved_16"),
      resolve_field(*registry_, "vxlan.next_protocol"),
      resolve_field(*registry_, "vxlan.vni"),
      resolve_field(*registry_, "vxlan.reserved_8"),
      VxlanFlavor::Standard,
  });
  const auto vxlan_gpe = state(VxlanDissectorState{
      resolve_field(*registry_, "vxlan.packet"),
      resolve_field(*registry_, "vxlan.flags"),
      resolve_field(*registry_, "vxlan.version"),
      resolve_field(*registry_, "vxlan.instance"),
      resolve_field(*registry_, "vxlan.next_protocol_present"),
      resolve_field(*registry_, "vxlan.oam"),
      resolve_field(*registry_, "vxlan.group_policy_present"),
      resolve_field(*registry_, "vxlan.vni_present"),
      resolve_field(*registry_, "vxlan.dont_learn"),
      resolve_field(*registry_, "vxlan.policy_applied"),
      resolve_field(*registry_, "vxlan.reserved_flags"),
      resolve_field(*registry_, "vxlan.group_policy_id"),
      resolve_field(*registry_, "vxlan.reserved_16"),
      resolve_field(*registry_, "vxlan.next_protocol"),
      resolve_field(*registry_, "vxlan.vni"),
      resolve_field(*registry_, "vxlan.reserved_8"),
      VxlanFlavor::Gpe,
  });
  const auto vxlan_standard_handle = add_handle(dissect_vxlan, vxlan_standard);
  bind_udp_port(4789, vxlan_standard_handle);
  bind_udp_port(8472, vxlan_standard_handle);
  bind_udp_port(4790, add_handle(dissect_vxlan, vxlan_gpe));

  const auto geneve = state(GeneveDissectorState{
      resolve_field(*registry_, "geneve.packet"),
      resolve_field(*registry_, "geneve.version"),
      resolve_field(*registry_, "geneve.option_length"),
      resolve_field(*registry_, "geneve.flags"),
      resolve_field(*registry_, "geneve.oam"),
      resolve_field(*registry_, "geneve.critical_options"),
      resolve_field(*registry_, "geneve.reserved_flags"),
      resolve_field(*registry_, "geneve.protocol_type"),
      resolve_field(*registry_, "geneve.vni"),
      resolve_field(*registry_, "geneve.reserved"),
      resolve_field(*registry_, "geneve.option"),
      resolve_field(*registry_, "geneve.option.class"),
      resolve_field(*registry_, "geneve.option.type"),
      resolve_field(*registry_, "geneve.option.critical"),
      resolve_field(*registry_, "geneve.option.reserved"),
      resolve_field(*registry_, "geneve.option.data_length"),
      resolve_field(*registry_, "geneve.option.data"),
  });
  bind_udp_port(6081, add_handle(dissect_geneve, geneve));

  const auto icmpv4 = state(Icmpv4DissectorState{
      resolve_field(*registry_, "icmp.message"),
      resolve_field(*registry_, "icmp.type"),
      resolve_field(*registry_, "icmp.code"),
      resolve_field(*registry_, "icmp.checksum"),
      resolve_field(*registry_, "icmp.identifier"),
      resolve_field(*registry_, "icmp.sequence"),
      resolve_field(*registry_, "icmp.gateway"),
      resolve_field(*registry_, "icmp.pointer"),
      resolve_field(*registry_, "icmp.mtu"),
      resolve_field(*registry_, "icmp.body"),
      resolve_field(*registry_, "icmp.quoted"),
      resolve_field(*registry_, "icmp.original_datagram_length_words"),
      resolve_field(*registry_, "icmp.original_datagram_length"),
      resolve_field(*registry_, "icmp.extended_sequence"),
      resolve_field(*registry_, "icmp.extended_flags"),
      resolve_field(*registry_, "icmp.originate_timestamp"),
      resolve_field(*registry_, "icmp.receive_timestamp"),
      resolve_field(*registry_, "icmp.transmit_timestamp"),
      resolve_field(*registry_, "icmp.address_mask"),
      resolve_field(*registry_, "icmp.router_address_count"),
      resolve_field(*registry_, "icmp.router_entry_size"),
      resolve_field(*registry_, "icmp.router_lifetime"),
      resolve_field(*registry_, "icmp.router_entry"),
      resolve_field(*registry_, "icmp.router_address"),
      resolve_field(*registry_, "icmp.router_preference"),
      icmp_extension_state(*registry_),
  });
  bind_ip_protocol(IpFamily::V4, 1, add_handle(dissect_icmpv4, icmpv4));

  const auto icmpv6 = state(Icmpv6DissectorState{
      resolve_field(*registry_, "icmpv6.message"),
      resolve_field(*registry_, "icmpv6.type"),
      resolve_field(*registry_, "icmpv6.code"),
      resolve_field(*registry_, "icmpv6.checksum"),
      resolve_field(*registry_, "icmpv6.informational"),
      resolve_field(*registry_, "icmpv6.identifier"),
      resolve_field(*registry_, "icmpv6.sequence"),
      resolve_field(*registry_, "icmpv6.mtu"),
      resolve_field(*registry_, "icmpv6.pointer"),
      resolve_field(*registry_, "icmpv6.target"),
      resolve_field(*registry_, "icmpv6.destination"),
      resolve_field(*registry_, "icmpv6.flags"),
      resolve_field(*registry_, "icmpv6.current_hop_limit"),
      resolve_field(*registry_, "icmpv6.router_lifetime"),
      resolve_field(*registry_, "icmpv6.reachable_time"),
      resolve_field(*registry_, "icmpv6.retrans_timer"),
      resolve_field(*registry_, "icmpv6.body"),
      resolve_field(*registry_, "icmpv6.quoted"),
      resolve_field(*registry_, "icmpv6.option"),
      resolve_field(*registry_, "icmpv6.option_type"),
      resolve_field(*registry_, "icmpv6.option_length"),
      resolve_field(*registry_, "icmpv6.option_body"),
      resolve_field(*registry_, "icmpv6.redirected_packet"),
      resolve_field(*registry_, "icmpv6.link_layer_address"),
      resolve_field(*registry_, "icmpv6.prefix_length"),
      resolve_field(*registry_, "icmpv6.prefix_flags"),
      resolve_field(*registry_, "icmpv6.valid_lifetime"),
      resolve_field(*registry_, "icmpv6.preferred_lifetime"),
      resolve_field(*registry_, "icmpv6.prefix"),
      resolve_field(*registry_, "icmpv6.original_datagram_length_words"),
      resolve_field(*registry_, "icmpv6.original_datagram_length"),
      resolve_field(*registry_, "icmpv6.extended_sequence"),
      resolve_field(*registry_, "icmpv6.extended_flags"),
      icmp_extension_state(*registry_),
      mld_state(*registry_),
  });
  bind_ip_protocol(IpFamily::V6, 58, add_handle(dissect_icmpv6, icmpv6));

  const auto linux_cooked_v1 = state(LinuxCookedDissectorState{
      resolve_field(*registry_, "sll.packet"),
      resolve_field(*registry_, "sll.version"),
      resolve_field(*registry_, "sll.protocol"),
      resolve_field(*registry_, "sll.packet_type"),
      resolve_field(*registry_, "sll.hardware_type"),
      resolve_field(*registry_, "sll.address_length"),
      resolve_field(*registry_, "sll.address"),
      resolve_field(*registry_, "sll.address_padding"),
      resolve_field(*registry_, "sll.interface_index"),
      resolve_field(*registry_, "sll.reserved"),
      1,
  });
  const auto linux_cooked_v2 = state(LinuxCookedDissectorState{
      resolve_field(*registry_, "sll.packet"),
      resolve_field(*registry_, "sll.version"),
      resolve_field(*registry_, "sll.protocol"),
      resolve_field(*registry_, "sll.packet_type"),
      resolve_field(*registry_, "sll.hardware_type"),
      resolve_field(*registry_, "sll.address_length"),
      resolve_field(*registry_, "sll.address"),
      resolve_field(*registry_, "sll.address_padding"),
      resolve_field(*registry_, "sll.interface_index"),
      resolve_field(*registry_, "sll.reserved"),
      2,
  });
  const auto linux_cooked_v1_handle =
      add_handle(dissect_linux_cooked, linux_cooked_v1);
  const auto linux_cooked_v2_handle =
      add_handle(dissect_linux_cooked, linux_cooked_v2);

  const auto null = state(NullLoopbackDissectorState{
      resolve_field(*registry_, "null.packet"),
      resolve_field(*registry_, "null.family"),
      resolve_field(*registry_, "null.type"),
      false,
  });
  const auto loop = state(NullLoopbackDissectorState{
      resolve_field(*registry_, "null.packet"),
      resolve_field(*registry_, "null.family"),
      resolve_field(*registry_, "null.type"),
      true,
  });
  const auto null_handle = add_handle(dissect_null_loopback, null);
  const auto loop_handle = add_handle(dissect_null_loopback, loop);

  const auto raw = state(RawDissectorState{
      resolve_field(*registry_, "raw.packet"),
  });
  const auto raw_handle = add_handle(dissect_raw, raw);

  const auto llc = state(LlcDissectorState{
      resolve_field(*registry_, "llc.packet"),
      resolve_field(*registry_, "llc.dsap"),
      resolve_field(*registry_, "llc.ssap"),
      resolve_field(*registry_, "llc.control"),
      resolve_field(*registry_, "llc.control_length"),
  });
  llc_ = add_handle(dissect_llc, llc);

  const auto snap_information = state(SnapDissectorState{
      resolve_field(*registry_, "snap.packet"),
      resolve_field(*registry_, "snap.oui"),
      resolve_field(*registry_, "snap.pid"),
      true,
  });
  const auto snap_non_information = state(SnapDissectorState{
      resolve_field(*registry_, "snap.packet"),
      resolve_field(*registry_, "snap.oui"),
      resolve_field(*registry_, "snap.pid"),
      false,
  });
  snap_information_ = add_handle(dissect_snap, snap_information);
  snap_non_information_ = add_handle(dissect_snap, snap_non_information);

  const auto lldp = state(LldpDissectorState{
      resolve_field(*registry_, "lldp.packet"),
      resolve_field(*registry_, "lldp.tlv"),
      resolve_field(*registry_, "lldp.tlv.type"),
      resolve_field(*registry_, "lldp.tlv.length"),
      resolve_field(*registry_, "lldp.tlv.value"),
      resolve_field(*registry_, "lldp.chassis.subtype"),
      resolve_field(*registry_, "lldp.chassis.id"),
      resolve_field(*registry_, "lldp.port.subtype"),
      resolve_field(*registry_, "lldp.port.id"),
      resolve_field(*registry_, "lldp.address_family"),
      resolve_field(*registry_, "lldp.ttl"),
      resolve_field(*registry_, "lldp.port_description"),
      resolve_field(*registry_, "lldp.system_name"),
      resolve_field(*registry_, "lldp.system_description"),
      resolve_field(*registry_, "lldp.system_capabilities"),
      resolve_field(*registry_, "lldp.enabled_capabilities"),
      resolve_field(*registry_, "lldp.management.address_length"),
      resolve_field(*registry_, "lldp.management.address_subtype"),
      resolve_field(*registry_, "lldp.management.address"),
      resolve_field(*registry_, "lldp.management.interface_subtype"),
      resolve_field(*registry_, "lldp.management.interface_number"),
      resolve_field(*registry_, "lldp.management.oid"),
      resolve_field(*registry_, "lldp.organization.oui"),
      resolve_field(*registry_, "lldp.organization.subtype"),
      resolve_field(*registry_, "lldp.organization.data"),
  });
  bind_ethertype(0x88cc, add_handle(dissect_lldp, lldp));

  const auto stp = state(StpDissectorState{
      resolve_field(*registry_, "stp.packet"),
      resolve_field(*registry_, "stp.protocol_identifier"),
      resolve_field(*registry_, "stp.version"),
      resolve_field(*registry_, "stp.type"),
      resolve_field(*registry_, "stp.flags"),
      resolve_field(*registry_, "stp.root.priority"),
      resolve_field(*registry_, "stp.root.system_id_extension"),
      resolve_field(*registry_, "stp.root.mac"),
      resolve_field(*registry_, "stp.root_path_cost"),
      resolve_field(*registry_, "stp.bridge.priority"),
      resolve_field(*registry_, "stp.bridge.system_id_extension"),
      resolve_field(*registry_, "stp.bridge.mac"),
      resolve_field(*registry_, "stp.port_id"),
      resolve_field(*registry_, "stp.message_age"),
      resolve_field(*registry_, "stp.max_age"),
      resolve_field(*registry_, "stp.hello_time"),
      resolve_field(*registry_, "stp.forward_delay"),
      resolve_field(*registry_, "stp.version_1_length"),
      resolve_field(*registry_, "stp.body"),
      MstpDissectorState{
          resolve_field(*registry_, "mstp.extension"),
          resolve_field(*registry_, "mstp.version_3_length"),
          resolve_field(*registry_, "mstp.config_format_selector"),
          resolve_field(*registry_, "mstp.config_name"),
          resolve_field(*registry_, "mstp.config_revision"),
          resolve_field(*registry_, "mstp.config_digest"),
          resolve_field(*registry_, "mstp.cist.internal_root_path_cost"),
          resolve_field(*registry_, "mstp.cist.bridge_priority"),
          resolve_field(*registry_, "mstp.cist.bridge_system_id_extension"),
          resolve_field(*registry_, "mstp.cist.bridge_mac"),
          resolve_field(*registry_, "mstp.cist.remaining_hops"),
          resolve_field(*registry_, "mstp.instance"),
          resolve_field(*registry_, "mstp.instance.flags"),
          resolve_field(*registry_, "mstp.instance.root_priority"),
          resolve_field(*registry_, "mstp.instance.id"),
          resolve_field(*registry_, "mstp.instance.regional_root_mac"),
          resolve_field(*registry_, "mstp.instance.internal_root_path_cost"),
          resolve_field(*registry_, "mstp.instance.bridge_priority"),
          resolve_field(*registry_, "mstp.instance.port_priority"),
          resolve_field(*registry_, "mstp.instance.remaining_hops"),
      },
  });
  const auto stp_handle = add_handle(dissect_stp, stp);

  bind_sll_protocol(0x0003, ethernet_handle);
  bind_sll_protocol(0x0004, llc_);
  bind_llc_sap(0x42, stp_handle);
  bind_snap_pid(0x0080c2, 0x000e, stp_handle);
  bind_ethertype(0x8181, stp_handle);
  bind_null_family(2, ipv4_handle);
  bind_null_family(24, ipv6_handle);
  bind_null_family(28, ipv6_handle);
  bind_null_family(30, ipv6_handle);

  for (const auto &definition : core_link_types()) {
    std::uint16_t handle_index = 0;
    switch (definition.kind) {
    case CoreLinkTypeKind::Ethernet:
      handle_index = ethernet_handle;
      break;
    case CoreLinkTypeKind::LinuxCookedV1:
      handle_index = linux_cooked_v1_handle;
      break;
    case CoreLinkTypeKind::LinuxCookedV2:
      handle_index = linux_cooked_v2_handle;
      break;
    case CoreLinkTypeKind::Null:
      handle_index = null_handle;
      break;
    case CoreLinkTypeKind::Loop:
      handle_index = loop_handle;
      break;
    case CoreLinkTypeKind::Raw:
      handle_index = raw_handle;
      break;
    }
    bind_dlt(static_cast<std::uint32_t>(definition.value), handle_index);
  }
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

const CommonDissectorState &DissectorCatalog::common() const noexcept {
  return *common_;
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

#include "parsing/catalog/catalog_sections.hpp"

#include "parsing/dissectors/network/arp_dissector.hpp"
#include "parsing/dissectors/network/icmp_extension.hpp"
#include "parsing/dissectors/network/icmpv4_dissector.hpp"
#include "parsing/dissectors/network/icmpv6_dissector.hpp"
#include "parsing/dissectors/network/igmp_dissector.hpp"
#include "parsing/dissectors/network/ipv4_dissector.hpp"
#include "parsing/dissectors/network/ipv6_dissector.hpp"
#include "parsing/dissectors/network/mld_dissector.hpp"

namespace pruftnet::parsing::internal {
namespace {

IcmpExtensionDissectorState
icmp_extension_state(const CatalogRegistrar &registrar) {
  return {
      registrar.field("icmp_ext.structure"),
      registrar.field("icmp_ext.version"),
      registrar.field("icmp_ext.reserved"),
      registrar.field("icmp_ext.checksum"),
      registrar.field("icmp_ext.checksum_valid"),
      registrar.field("icmp_ext.object"),
      registrar.field("icmp_ext.object.length"),
      registrar.field("icmp_ext.object.class"),
      registrar.field("icmp_ext.object.ctype"),
      registrar.field("icmp_ext.object.data"),
      registrar.field("icmp_ext.mpls_entry"),
      registrar.field("icmp_ext.mpls_label"),
      registrar.field("icmp_ext.mpls_traffic_class"),
      registrar.field("icmp_ext.mpls_bottom_of_stack"),
      registrar.field("icmp_ext.mpls_ttl"),
  };
}

MldDissectorState mld_state(const CatalogRegistrar &registrar) {
  return {
      registrar.field("mld.message"),
      registrar.field("mld.version"),
      registrar.field("mld.maximum_response_code"),
      registrar.field("mld.maximum_response_delay"),
      registrar.field("mld.reserved"),
      registrar.field("mld.multicast_address"),
      registrar.field("mld.flags"),
      registrar.field("mld.suppress"),
      registrar.field("mld.qrv"),
      registrar.field("mld.qqic"),
      registrar.field("mld.query_interval"),
      registrar.field("mld.source_count"),
      registrar.field("mld.source_address"),
      registrar.field("mld.record_count"),
      registrar.field("mld.record"),
      registrar.field("mld.record.type"),
      registrar.field("mld.record.aux_data_length"),
      registrar.field("mld.record.source_count"),
      registrar.field("mld.record.multicast_address"),
      registrar.field("mld.record.source_address"),
      registrar.field("mld.record.aux_data"),
      registrar.field("mld.trailing"),
  };
}

} // namespace

void register_network_catalog(CatalogRegistrar &registrar) {
  const auto ipv4_handle = registrar.add_state(
      dissect_ipv4, Ipv4DissectorState{
                        registrar.field("ipv4.packet"),
                        registrar.field("ipv4.version"),
                        registrar.field("ipv4.header_length"),
                        registrar.field("ipv4.dscp_ecn"),
                        registrar.field("ipv4.total_length"),
                        registrar.field("ipv4.identification"),
                        registrar.field("ipv4.flags"),
                        registrar.field("ipv4.reserved_flag"),
                        registrar.field("ipv4.dont_fragment"),
                        registrar.field("ipv4.more_fragments"),
                        registrar.field("ipv4.fragment_offset_encoded"),
                        registrar.field("ipv4.fragment_offset"),
                        registrar.field("ipv4.reassembled"),
                        registrar.field("ipv4.reassembled_length"),
                        registrar.field("ipv4.reassembled_fragment_count"),
                        registrar.field("ipv4.fragment_overlap"),
                        registrar.field("ipv4.ttl"),
                        registrar.field("ipv4.protocol"),
                        registrar.field("ipv4.checksum"),
                        registrar.field("ipv4.source"),
                        registrar.field("ipv4.destination"),
                        registrar.field("ipv4.options"),
                    });
  registrar.bind_ethertype(0x0800, ipv4_handle);

  registrar.bind_ip_protocol(
      IpFamily::V4, 2,
      registrar.add_state(dissect_igmp,
                          IgmpDissectorState{
                              registrar.field("igmp.packet"),
                              registrar.field("igmp.type"),
                              registrar.field("igmp.version"),
                              registrar.field("igmp.max_response_code"),
                              registrar.field("igmp.max_response_time"),
                              registrar.field("igmp.checksum"),
                              registrar.field("igmp.checksum_valid"),
                              registrar.field("igmp.group_address"),
                              registrar.field("igmp.reserved"),
                              registrar.field("igmp.suppress"),
                              registrar.field("igmp.qrv"),
                              registrar.field("igmp.qqic"),
                              registrar.field("igmp.query_interval"),
                              registrar.field("igmp.source_count"),
                              registrar.field("igmp.source_address"),
                              registrar.field("igmp.record_count"),
                              registrar.field("igmp.record"),
                              registrar.field("igmp.record.type"),
                              registrar.field("igmp.record.aux_data_length"),
                              registrar.field("igmp.record.source_count"),
                              registrar.field("igmp.record.multicast_address"),
                              registrar.field("igmp.record.source_address"),
                              registrar.field("igmp.record.aux_data"),
                              registrar.field("igmp.trailing"),
                          }));

  const auto arp_handle = registrar.add_state(
      dissect_arp, ArpDissectorState{
                       registrar.field("arp.packet"),
                       registrar.field("rarp.packet"),
                       registrar.field("inarp.packet"),
                       registrar.field("arp.hardware_type"),
                       registrar.field("arp.protocol_type"),
                       registrar.field("arp.hardware_length"),
                       registrar.field("arp.protocol_length"),
                       registrar.field("arp.operation"),
                       registrar.field("arp.sender_hardware"),
                       registrar.field("arp.sender_protocol"),
                       registrar.field("arp.target_hardware"),
                       registrar.field("arp.target_protocol"),
                   });
  registrar.bind_ethertype(0x0806, arp_handle);
  registrar.bind_ethertype(0x8035, arp_handle);

  const auto ipv6_handle = registrar.add_state(
      dissect_ipv6, Ipv6DissectorState{
                        registrar.field("ipv6.packet"),
                        registrar.field("ipv6.version"),
                        registrar.field("ipv6.traffic_class"),
                        registrar.field("ipv6.flow_label"),
                        registrar.field("ipv6.payload_length"),
                        registrar.field("ipv6.next_header"),
                        registrar.field("ipv6.hop_limit"),
                        registrar.field("ipv6.source"),
                        registrar.field("ipv6.destination"),
                        registrar.field("ipv6.extension"),
                        registrar.field("ipv6.extension_next_header"),
                        registrar.field("ipv6.extension_length"),
                        registrar.field("ipv6.extension_type"),
                        registrar.field("ipv6.extension_data"),
                        registrar.field("ipv6.fragment_offset_encoded"),
                        registrar.field("ipv6.fragment_offset"),
                        registrar.field("ipv6.fragment_reserved_octet"),
                        registrar.field("ipv6.fragment_reserved"),
                        registrar.field("ipv6.fragment_more"),
                        registrar.field("ipv6.fragment_atomic"),
                        registrar.field("ipv6.fragment_identification"),
                        registrar.field("ipv6.reassembled"),
                        registrar.field("ipv6.reassembled_length"),
                        registrar.field("ipv6.reassembled_fragment_count"),
                        registrar.field("ipv6.fragment_overlap"),
                    });
  registrar.bind_ethertype(0x86dd, ipv6_handle);

  registrar.bind_ip_protocol(IpFamily::V4, 4, ipv4_handle);
  registrar.bind_ip_protocol(IpFamily::V6, 4, ipv4_handle);
  registrar.bind_ip_protocol(IpFamily::V4, 41, ipv6_handle);
  registrar.bind_ip_protocol(IpFamily::V6, 41, ipv6_handle);

  registrar.bind_ip_protocol(
      IpFamily::V4, 1,
      registrar.add_state(
          dissect_icmpv4,
          Icmpv4DissectorState{
              registrar.field("icmp.message"),
              registrar.field("icmp.type"),
              registrar.field("icmp.code"),
              registrar.field("icmp.checksum"),
              registrar.field("icmp.identifier"),
              registrar.field("icmp.sequence"),
              registrar.field("icmp.gateway"),
              registrar.field("icmp.pointer"),
              registrar.field("icmp.mtu"),
              registrar.field("icmp.body"),
              registrar.field("icmp.quoted"),
              registrar.field("icmp.original_datagram_length_words"),
              registrar.field("icmp.original_datagram_length"),
              registrar.field("icmp.extended_sequence"),
              registrar.field("icmp.extended_flags"),
              registrar.field("icmp.originate_timestamp"),
              registrar.field("icmp.receive_timestamp"),
              registrar.field("icmp.transmit_timestamp"),
              registrar.field("icmp.address_mask"),
              registrar.field("icmp.router_address_count"),
              registrar.field("icmp.router_entry_size"),
              registrar.field("icmp.router_lifetime"),
              registrar.field("icmp.router_entry"),
              registrar.field("icmp.router_address"),
              registrar.field("icmp.router_preference"),
              icmp_extension_state(registrar),
          }));

  registrar.bind_ip_protocol(
      IpFamily::V6, 58,
      registrar.add_state(
          dissect_icmpv6,
          Icmpv6DissectorState{
              registrar.field("icmpv6.message"),
              registrar.field("icmpv6.type"),
              registrar.field("icmpv6.code"),
              registrar.field("icmpv6.checksum"),
              registrar.field("icmpv6.informational"),
              registrar.field("icmpv6.identifier"),
              registrar.field("icmpv6.sequence"),
              registrar.field("icmpv6.mtu"),
              registrar.field("icmpv6.pointer"),
              registrar.field("icmpv6.target"),
              registrar.field("icmpv6.destination"),
              registrar.field("icmpv6.flags"),
              registrar.field("icmpv6.current_hop_limit"),
              registrar.field("icmpv6.router_lifetime"),
              registrar.field("icmpv6.reachable_time"),
              registrar.field("icmpv6.retrans_timer"),
              registrar.field("icmpv6.body"),
              registrar.field("icmpv6.quoted"),
              registrar.field("icmpv6.option"),
              registrar.field("icmpv6.option_type"),
              registrar.field("icmpv6.option_length"),
              registrar.field("icmpv6.option_body"),
              registrar.field("icmpv6.redirected_packet"),
              registrar.field("icmpv6.link_layer_address"),
              registrar.field("icmpv6.prefix_length"),
              registrar.field("icmpv6.prefix_flags"),
              registrar.field("icmpv6.valid_lifetime"),
              registrar.field("icmpv6.preferred_lifetime"),
              registrar.field("icmpv6.prefix"),
              registrar.field("icmpv6.original_datagram_length_words"),
              registrar.field("icmpv6.original_datagram_length"),
              registrar.field("icmpv6.extended_sequence"),
              registrar.field("icmpv6.extended_flags"),
              icmp_extension_state(registrar),
              mld_state(registrar),
          }));

  registrar.bind_null_family(2, ipv4_handle);
  registrar.bind_null_family(24, ipv6_handle);
  registrar.bind_null_family(28, ipv6_handle);
  registrar.bind_null_family(30, ipv6_handle);
}

} // namespace pruftnet::parsing::internal

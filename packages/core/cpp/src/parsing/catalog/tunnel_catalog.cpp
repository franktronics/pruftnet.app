#include "parsing/catalog/catalog_sections.hpp"

#include "parsing/dissectors/tunnel/geneve_dissector.hpp"
#include "parsing/dissectors/tunnel/gre_dissector.hpp"
#include "parsing/dissectors/tunnel/mpls_dissector.hpp"
#include "parsing/dissectors/tunnel/vxlan_dissector.hpp"

namespace pruftnet::parsing::internal {

void register_tunnel_catalog(CatalogRegistrar &registrar,
                             const LinkCatalogHandles &link) {
  const auto mpls_handle = registrar.add_state(
      dissect_mpls, MplsDissectorState{
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
  registrar.bind_ethertype(0x8847, mpls_handle);
  registrar.bind_ethertype(0x8848, mpls_handle);
  registrar.bind_ip_protocol(IpFamily::V4, 137, mpls_handle);
  registrar.bind_ip_protocol(IpFamily::V6, 137, mpls_handle);
  registrar.bind_udp_port(6635, mpls_handle);

  const auto gre_handle = registrar.add_state(
      dissect_gre, GreDissectorState{
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
  registrar.bind_ip_protocol(IpFamily::V4, 47, gre_handle);
  registrar.bind_ip_protocol(IpFamily::V6, 47, gre_handle);
  registrar.bind_ethertype(0x6558, link.ethernet);

  const auto vxlan_standard_handle = registrar.add_state(
      dissect_vxlan, VxlanDissectorState{
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
  registrar.bind_udp_port(4789, vxlan_standard_handle);
  registrar.bind_udp_port(8472, vxlan_standard_handle);
  registrar.bind_udp_port(
      4790,
      registrar.add_state(dissect_vxlan,
                          VxlanDissectorState{
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
                          }));

  registrar.bind_udp_port(
      6081,
      registrar.add_state(dissect_geneve,
                          GeneveDissectorState{
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
                          }));
}

} // namespace pruftnet::parsing::internal

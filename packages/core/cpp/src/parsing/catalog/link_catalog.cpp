#include "parsing/catalog/catalog_sections.hpp"

#include "parsing/core_link_types.hpp"
#include "parsing/dissectors/link/ethernet_dissector.hpp"
#include "parsing/dissectors/link/linux_cooked_dissector.hpp"
#include "parsing/dissectors/link/llc_dissector.hpp"
#include "parsing/dissectors/link/lldp_dissector.hpp"
#include "parsing/dissectors/link/null_loopback_dissector.hpp"
#include "parsing/dissectors/link/raw_dissector.hpp"
#include "parsing/dissectors/link/snap_dissector.hpp"
#include "parsing/dissectors/link/stp_dissector.hpp"
#include "parsing/dissectors/link/vlan_dissector.hpp"

namespace pruftnet::parsing::internal {

LinkCatalogHandles register_link_catalog(CatalogRegistrar &registrar) {
  const auto ethernet_handle = registrar.add_state(
      dissect_ethernet, EthernetDissectorState{
                            registrar.field("eth.frame"),
                            registrar.field("eth.destination"),
                            registrar.field("eth.source"),
                            registrar.field("eth.type"),
                            registrar.field("eth.trailer"),
                        });
  registrar.assign_ethernet(ethernet_handle);

  const auto vlan_handle =
      registrar.add_state(dissect_vlan, VlanDissectorState{
                                            registrar.field("vlan.tag"),
                                            registrar.field("vlan.priority"),
                                            registrar.field("vlan.dei"),
                                            registrar.field("vlan.id"),
                                            registrar.field("vlan.type"),
                                            registrar.field("vlan.trailer"),
                                        });
  registrar.bind_ethertype(0x8100, vlan_handle);
  registrar.bind_ethertype(0x88a8, vlan_handle);

  const auto linux_cooked_v1_handle = registrar.add_state(
      dissect_linux_cooked, LinuxCookedDissectorState{
                                registrar.field("sll.packet"),
                                registrar.field("sll.version"),
                                registrar.field("sll.protocol"),
                                registrar.field("sll.packet_type"),
                                registrar.field("sll.hardware_type"),
                                registrar.field("sll.address_length"),
                                registrar.field("sll.address"),
                                registrar.field("sll.address_padding"),
                                registrar.field("sll.interface_index"),
                                registrar.field("sll.reserved"),
                                1,
                            });
  const auto linux_cooked_v2_handle = registrar.add_state(
      dissect_linux_cooked, LinuxCookedDissectorState{
                                registrar.field("sll.packet"),
                                registrar.field("sll.version"),
                                registrar.field("sll.protocol"),
                                registrar.field("sll.packet_type"),
                                registrar.field("sll.hardware_type"),
                                registrar.field("sll.address_length"),
                                registrar.field("sll.address"),
                                registrar.field("sll.address_padding"),
                                registrar.field("sll.interface_index"),
                                registrar.field("sll.reserved"),
                                2,
                            });

  const auto null_handle = registrar.add_state(
      dissect_null_loopback, NullLoopbackDissectorState{
                                 registrar.field("null.packet"),
                                 registrar.field("null.family"),
                                 registrar.field("null.type"),
                                 false,
                             });
  const auto loop_handle = registrar.add_state(
      dissect_null_loopback, NullLoopbackDissectorState{
                                 registrar.field("null.packet"),
                                 registrar.field("null.family"),
                                 registrar.field("null.type"),
                                 true,
                             });

  const auto raw_handle =
      registrar.add_state(dissect_raw, RawDissectorState{
                                           registrar.field("raw.packet"),
                                       });

  const auto llc_handle = registrar.add_state(
      dissect_llc, LlcDissectorState{
                       registrar.field("llc.packet"),
                       registrar.field("llc.dsap"),
                       registrar.field("llc.ssap"),
                       registrar.field("llc.control"),
                       registrar.field("llc.control_length"),
                   });
  registrar.assign_llc(llc_handle);

  const auto snap_information_handle =
      registrar.add_state(dissect_snap, SnapDissectorState{
                                            registrar.field("snap.packet"),
                                            registrar.field("snap.oui"),
                                            registrar.field("snap.pid"),
                                            true,
                                        });
  const auto snap_non_information_handle =
      registrar.add_state(dissect_snap, SnapDissectorState{
                                            registrar.field("snap.packet"),
                                            registrar.field("snap.oui"),
                                            registrar.field("snap.pid"),
                                            false,
                                        });
  registrar.assign_snap(snap_information_handle, snap_non_information_handle);

  registrar.bind_ethertype(
      0x88cc, registrar.add_state(
                  dissect_lldp,
                  LldpDissectorState{
                      registrar.field("lldp.packet"),
                      registrar.field("lldp.tlv"),
                      registrar.field("lldp.tlv.type"),
                      registrar.field("lldp.tlv.length"),
                      registrar.field("lldp.tlv.value"),
                      registrar.field("lldp.chassis.subtype"),
                      registrar.field("lldp.chassis.id"),
                      registrar.field("lldp.port.subtype"),
                      registrar.field("lldp.port.id"),
                      registrar.field("lldp.address_family"),
                      registrar.field("lldp.ttl"),
                      registrar.field("lldp.port_description"),
                      registrar.field("lldp.system_name"),
                      registrar.field("lldp.system_description"),
                      registrar.field("lldp.system_capabilities"),
                      registrar.field("lldp.enabled_capabilities"),
                      registrar.field("lldp.management.address_length"),
                      registrar.field("lldp.management.address_subtype"),
                      registrar.field("lldp.management.address"),
                      registrar.field("lldp.management.interface_subtype"),
                      registrar.field("lldp.management.interface_number"),
                      registrar.field("lldp.management.oid"),
                      registrar.field("lldp.organization.oui"),
                      registrar.field("lldp.organization.subtype"),
                      registrar.field("lldp.organization.data"),
                  }));

  const auto stp_handle = registrar.add_state(
      dissect_stp,
      StpDissectorState{
          registrar.field("stp.packet"),
          registrar.field("stp.protocol_identifier"),
          registrar.field("stp.version"),
          registrar.field("stp.type"),
          registrar.field("stp.flags"),
          registrar.field("stp.root.priority"),
          registrar.field("stp.root.system_id_extension"),
          registrar.field("stp.root.mac"),
          registrar.field("stp.root_path_cost"),
          registrar.field("stp.bridge.priority"),
          registrar.field("stp.bridge.system_id_extension"),
          registrar.field("stp.bridge.mac"),
          registrar.field("stp.port_id"),
          registrar.field("stp.message_age"),
          registrar.field("stp.max_age"),
          registrar.field("stp.hello_time"),
          registrar.field("stp.forward_delay"),
          registrar.field("stp.version_1_length"),
          registrar.field("stp.body"),
          MstpDissectorState{
              registrar.field("mstp.extension"),
              registrar.field("mstp.version_3_length"),
              registrar.field("mstp.config_format_selector"),
              registrar.field("mstp.config_name"),
              registrar.field("mstp.config_revision"),
              registrar.field("mstp.config_digest"),
              registrar.field("mstp.cist.internal_root_path_cost"),
              registrar.field("mstp.cist.bridge_priority"),
              registrar.field("mstp.cist.bridge_system_id_extension"),
              registrar.field("mstp.cist.bridge_mac"),
              registrar.field("mstp.cist.remaining_hops"),
              registrar.field("mstp.instance"),
              registrar.field("mstp.instance.flags"),
              registrar.field("mstp.instance.root_priority"),
              registrar.field("mstp.instance.id"),
              registrar.field("mstp.instance.regional_root_mac"),
              registrar.field("mstp.instance.internal_root_path_cost"),
              registrar.field("mstp.instance.bridge_priority"),
              registrar.field("mstp.instance.port_priority"),
              registrar.field("mstp.instance.remaining_hops"),
          },
      });

  registrar.bind_sll_protocol(0x0003, ethernet_handle);
  registrar.bind_sll_protocol(0x0004, llc_handle);
  registrar.bind_llc_sap(0x42, stp_handle);
  registrar.bind_snap_pid(0x0080c2, 0x000e, stp_handle);
  registrar.bind_ethertype(0x8181, stp_handle);

  for (const auto &definition : core_link_types()) {
    CatalogHandleIndex handle = 0;
    switch (definition.kind) {
    case CoreLinkTypeKind::Ethernet:
      handle = ethernet_handle;
      break;
    case CoreLinkTypeKind::LinuxCookedV1:
      handle = linux_cooked_v1_handle;
      break;
    case CoreLinkTypeKind::LinuxCookedV2:
      handle = linux_cooked_v2_handle;
      break;
    case CoreLinkTypeKind::Null:
      handle = null_handle;
      break;
    case CoreLinkTypeKind::Loop:
      handle = loop_handle;
      break;
    case CoreLinkTypeKind::Raw:
      handle = raw_handle;
      break;
    }
    registrar.bind_dlt(static_cast<std::uint32_t>(definition.value), handle);
  }

  return {
      .ethernet = ethernet_handle,
  };
}

} // namespace pruftnet::parsing::internal

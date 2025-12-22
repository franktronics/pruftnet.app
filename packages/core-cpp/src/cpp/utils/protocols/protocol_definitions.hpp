#pragma once

#include "layer2_protocols.hpp"
#include "layer3_protocols.hpp"
#include "layer4_protocols.hpp"
#include "protocol_types.hpp"

// ============================================================================
// Protocol Lookup Functions
// ============================================================================

/**
 * Get protocol definition by ID
 * Returns nullptr if protocol not implemented
 */
inline const ProtocolDefinition* getProtocolDefinition(ProtocolId id) {
  switch (id) {
    // Layer 2 Protocols
    case ProtocolId::ETHERNET: return &ETHERNET_DEFINITION;
    case ProtocolId::ARP: return &ARP_DEFINITION;
    case ProtocolId::RARP: return &RARP_DEFINITION;
    case ProtocolId::VLAN: return &VLAN_DEFINITION;
    case ProtocolId::VLAN_DOUBLE: return &VLAN_DOUBLE_DEFINITION;
    case ProtocolId::MPLS: return &MPLS_DEFINITION;
    case ProtocolId::PPPOE_DISCOVERY: return &PPPOE_DISCOVERY_DEFINITION;
    case ProtocolId::PPPOE_SESSION: return &PPPOE_SESSION_DEFINITION;

    // Layer 3 Protocols
    case ProtocolId::IPV4: return &IPV4_DEFINITION;
    case ProtocolId::IPV6: return &IPV6_DEFINITION;
    case ProtocolId::ICMP: return &ICMP_DEFINITION;
    case ProtocolId::ICMPV6: return &ICMPV6_DEFINITION;
    case ProtocolId::IGMP: return &IGMP_DEFINITION;
    case ProtocolId::GRE: return &GRE_DEFINITION;
    case ProtocolId::ESP: return &ESP_DEFINITION;
    case ProtocolId::AH: return &AH_DEFINITION;
    case ProtocolId::OSPF: return &OSPF_DEFINITION;
    case ProtocolId::IPV6_HOPOPT: return &IPV6_HOPOPT_DEFINITION;
    case ProtocolId::IPV6_ROUTING: return &IPV6_ROUTING_DEFINITION;
    case ProtocolId::IPV6_FRAGMENT: return &IPV6_FRAGMENT_DEFINITION;
    case ProtocolId::IPV6_DSTOPT: return &IPV6_DSTOPT_DEFINITION;

    // Layer 4 Protocols
    case ProtocolId::TCP: return &TCP_DEFINITION;
    case ProtocolId::UDP: return &UDP_DEFINITION;
    case ProtocolId::SCTP: return &SCTP_DEFINITION;
    case ProtocolId::DCCP: return &DCCP_DEFINITION;
    case ProtocolId::UDPLITE: return &UDPLITE_DEFINITION;

    // Not yet implemented
    default: return nullptr;
  }
}

/**
 * Look up the next protocol from a protocol definition and field value
 * Returns ProtocolId::UNKNOWN if no mapping found
 */
inline ProtocolId lookupNextProtocol(const ProtocolDefinition* def, uint32_t field_value) {
  if (!def || def->next_protocol_field_id == 255) {
    return ProtocolId::UNKNOWN;
  }

  for (uint8_t i = 0; i < def->next_protocol_mapping_count; ++i) {
    if (def->next_protocol_mappings[i].field_value == field_value) {
      return def->next_protocol_mappings[i].next_protocol;
    }
  }

  return ProtocolId::UNKNOWN;
}

#pragma once

#include <array>
#include <cstdint>

// ============================================================================
// Protocol Identifiers
// Organized by OSI layer for clarity
// References: IEEE 802.3, RFC 791, RFC 8200, RFC 792, RFC 793, RFC 768, etc.
// ============================================================================

enum class ProtocolId : uint8_t {
  // ========================================================================
  // Layer 2 - Data Link Layer
  // ========================================================================
  ETHERNET = 0,        // IEEE 802.3 Ethernet II frame
  ARP = 1,             // RFC 826 - Address Resolution Protocol
  RARP = 2,            // RFC 903 - Reverse ARP
  VLAN = 3,            // IEEE 802.1Q - VLAN tagging (C-Tag)
  VLAN_DOUBLE = 4,     // IEEE 802.1ad - QinQ / S-Tag (double VLAN)
  LLDP = 5,            // IEEE 802.1AB - Link Layer Discovery Protocol
  PPP = 6,             // RFC 1661 - Point-to-Point Protocol
  PPPOE_DISCOVERY = 7, // RFC 2516 - PPPoE Discovery Stage
  PPPOE_SESSION = 8,   // RFC 2516 - PPPoE Session Stage
  MPLS = 9,            // RFC 3031/5332 - MPLS Label
  MACSEC = 10,         // IEEE 802.1AE - MACsec

  // ========================================================================
  // Layer 3 - Network Layer
  // ========================================================================
  IPV4 = 20,   // RFC 791 - Internet Protocol version 4
  IPV6 = 21,   // RFC 8200 - Internet Protocol version 6
  ICMP = 22,   // RFC 792 - Internet Control Message Protocol (v4)
  ICMPV6 = 23, // RFC 4443 - ICMPv6
  IGMP = 24,   // RFC 1112 - Internet Group Management Protocol

  // IPv6 Extension Headers (RFC 8200)
  IPV6_HOPOPT = 30,   // Hop-by-Hop Options (Next Header = 0)
  IPV6_ROUTING = 31,  // Routing Header (Next Header = 43)
  IPV6_FRAGMENT = 32, // Fragment Header (Next Header = 44)
  IPV6_DSTOPT = 33,   // Destination Options (Next Header = 60)

  // Tunneling & Encapsulation
  GRE = 40,          // RFC 2784 - Generic Routing Encapsulation
  ESP = 41,          // RFC 4303 - Encapsulating Security Payload (IPSec)
  AH = 42,           // RFC 4302 - Authentication Header (IPSec)
  IPIP = 43,         // RFC 2003 - IP-in-IP encapsulation
  IPV6_IN_IPV4 = 44, // RFC 2473 - IPv6 tunneled over IPv4

  // ========================================================================
  // Layer 4 - Transport Layer
  // ========================================================================
  TCP = 50,     // RFC 9293 - Transmission Control Protocol
  UDP = 51,     // RFC 768 - User Datagram Protocol
  SCTP = 52,    // RFC 9260 - Stream Control Transmission Protocol
  DCCP = 53,    // RFC 4340 - Datagram Congestion Control Protocol
  UDPLITE = 54, // RFC 3828 - UDP-Lite

  // ========================================================================
  // Layer 5-7 - Application Layer Protocols (identified by port)
  // ========================================================================
  // DNS
  DNS = 60, // RFC 1035 - Domain Name System (UDP/TCP 53)

  // DHCP
  DHCP = 61,   // RFC 2131 - Dynamic Host Configuration Protocol (UDP 67/68)
  DHCPV6 = 62, // RFC 8415 - DHCPv6 (UDP 546/547)

  // HTTP
  HTTP = 63,  // RFC 9110 - Hypertext Transfer Protocol (TCP 80)
  HTTPS = 64, // RFC 2818 - HTTP over TLS (TCP 443)

  // TLS/SSL
  TLS = 65, // RFC 8446 - Transport Layer Security

  // SSH/Telnet
  SSH = 66,    // RFC 4253 - Secure Shell (TCP 22)
  TELNET = 67, // RFC 854 - Telnet (TCP 23)

  // File Transfer
  FTP_CONTROL = 68, // RFC 959 - FTP Control (TCP 21)
  FTP_DATA = 69,    // RFC 959 - FTP Data (TCP 20)
  TFTP = 70,        // RFC 1350 - Trivial FTP (UDP 69)

  // Email
  SMTP = 71, // RFC 5321 - Simple Mail Transfer (TCP 25/587)
  POP3 = 72, // RFC 1939 - Post Office Protocol 3 (TCP 110)
  IMAP = 73, // RFC 9051 - Internet Message Access Protocol (TCP 143)

  // Network Management
  SNMP = 74,   // RFC 3411 - Simple Network Management Protocol (UDP 161/162)
  NTP = 75,    // RFC 5905 - Network Time Protocol (UDP 123)
  SYSLOG = 76, // RFC 5424 - Syslog Protocol (UDP 514)

  // Routing Protocols
  BGP = 77,  // RFC 4271 - Border Gateway Protocol (TCP 179)
  OSPF = 78, // RFC 2328 - OSPF (IP Protocol 89)
  RIP = 79,  // RFC 2453 - Routing Information Protocol (UDP 520)

  // VoIP/Multimedia
  SIP = 80,  // RFC 3261 - Session Initiation Protocol (UDP/TCP 5060)
  RTP = 81,  // RFC 3550 - Real-time Transport Protocol (UDP dynamic)
  RTCP = 82, // RFC 3550 - RTP Control Protocol

  // Database
  MYSQL = 83,      // MySQL Protocol (TCP 3306)
  POSTGRESQL = 84, // PostgreSQL Protocol (TCP 5432)
  REDIS = 85,      // Redis Protocol (TCP 6379)

  // Other Common Protocols
  LDAP = 86,    // RFC 4511 - LDAP (TCP 389)
  RADIUS = 87,  // RFC 2865 - RADIUS (UDP 1812/1813)
  NETBIOS = 88, // RFC 1001/1002 - NetBIOS (UDP 137/138, TCP 139)
  SMB = 89,     // SMB/CIFS (TCP 445)
  MQTT = 90,    // OASIS MQTT (TCP 1883/8883)

  // Time Synchronization
  PTP = 91, // IEEE 1588 - Precision Time Protocol (EtherType 0x88F7)

  // ========================================================================
  // Special
  // ========================================================================
  RAW_PAYLOAD = 254, // Unidentified payload data
  UNKNOWN = 255      // Unknown/unsupported protocol
};

struct FieldDefinition {
  uint16_t bit_offset;
  uint16_t bit_length;
  uint8_t field_id;
};

/**
 * Mapping from a field value to the next protocol
 * Example: EtherType 0x0800 -> IPV4
 */
struct NextProtocolMapping {
  uint32_t field_value;
  ProtocolId next_protocol;
};

constexpr size_t MAX_FIELDS_PER_PROTOCOL = 16;
constexpr size_t MAX_NEXT_PROTOCOL_MAPPINGS = 32; // Ethernet has many EtherTypes
constexpr size_t MAX_PROTOCOLS_PER_PACKET = 12;   // Support deep tunneling

struct ProtocolDefinition {
  ProtocolId id;
  uint8_t header_size_bytes;
  uint8_t field_count;
  uint8_t next_protocol_field_id; // 255 = no next protocol (terminal)
  uint8_t next_protocol_mapping_count;
  std::array<FieldDefinition, MAX_FIELDS_PER_PROTOCOL> fields;
  std::array<NextProtocolMapping, MAX_NEXT_PROTOCOL_MAPPINGS> next_protocol_mappings;
};

struct FieldEntry {
  uint16_t byte_offset;
  uint8_t byte_length;
  uint8_t field_id;
};

struct ProtocolEntry {
  ProtocolId protocol_id;
  uint16_t header_offset;
  uint8_t field_count;
  std::array<FieldEntry, MAX_FIELDS_PER_PROTOCOL> fields;
};

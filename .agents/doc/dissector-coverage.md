# Dissector Coverage and Next Priorities

Status: implemented and validated on 2026-07-16.

## Implemented

- Link layers: Frame, Ethernet II, IEEE 802.3 length handling, VLAN, Linux SLL/SLL2, NULL/LOOP, RAW, LLC, and SNAP.
- Discovery and bridging: LLDP, STP, RSTP, and MSTP.
- Network and control: ARP, RARP, InARP, IPv4, IPv6, ICMPv4, ICMPv6, RFC 4884 extensions, IGMP, MLD, and MPLS.
- Transport and infrastructure: UDP, TCP, DNS, mDNS, LLMNR, DHCPv4, DHCPv6, and NTP.
- Encapsulation: IP-in-IP, GRE, VXLAN, VXLAN-GPE, and Geneve.
- Application and security: HTTP/1.x, TLS record and cleartext handshake parsing, and QUIC invariant/v1/v2 packet headers.

The parser includes bounded IPv4/IPv6 fragment reassembly, bounded directional TCP stream reassembly, contributor provenance for derived sources, retransmission/overlap handling, and reset on capture identity changes.

## Explicit Limits

- TLS application data is not decrypted. Cleartext handshake records are decoded; records after a valid directional `ChangeCipherSpec` remain opaque.
- QUIC header protection and packet protection are not removed. Packet numbers, frames, CRYPTO streams, and HTTP/3 are therefore not decoded yet.
- QUIC is currently claimed by UDP port 443. A rollback-capable UDP heuristic registry is not implemented.
- HTTP coverage is HTTP/1.x. HTTP/2, HPACK, HTTP/3, and QPACK are separate protocols.
- TCP options remain raw; advanced RTT, expert analysis, and conversation diagnostics are not yet Wireshark-equivalent.

## Next Dissector Order

1. QUIC Initial deprotection/decryption, frame parsing, and CRYPTO stream reassembly.
2. HTTP/2 with HPACK, followed by HTTP/3 with QPACK once QUIC streams exist.
3. X.509 certificate and richer TLS handshake/cipher metadata.
4. SSH and SMB2/SMB3 for common interactive and file-service traffic.
5. SNMP, Syslog, MQTT, CoAP, and WebSocket.
6. Routing and redundancy protocols: OSPFv2/v3, BGP, RIP/RIPng, VRRP, and IS-IS.
7. Detailed TCP options and state analysis.

The first item requires a deliberate cross-platform cryptographic dependency and key-ingestion contract. It should not be implemented as local ad hoc crypto.

# Protocol Hierarchy Map

```text
Ethernet (ethernet.json)
├── 0x0800 -> IPv4 (ipv4.json)
│   ├── 0x01 -> ICMP (icmp.json)
│   ├── 0x06 -> TCP (tcp.json)
│   │   ├── 53  -> DNS (dns.json)
│   │   ├── 80  -> HTTP (http.json)
│   │   └── 443 -> TLS (tls.json) [HTTPS]
│   └── 0x11 -> UDP (udp.json)
│       ├── 53 -> DNS (dns.json)
│       ├── 67 -> DHCP (dhcp.json) [Server]
│       ├── 68 -> DHCP (dhcp.json) [Client]
│       └── 80 -> HTTP (http.json)
├── 0x0806 -> ARP (arp.json)
├── 0x86DD -> IPv6 (ipv6.json)
│   ├── 6    -> TCP (tcp.json)
│   │   ├── 53  -> DNS (dns.json)
│   │   ├── 80  -> HTTP (http.json)
│   │   └── 443 -> TLS (tls.json) [HTTPS]
│   ├── 17   -> UDP (udp.json)
│   │   ├── 53 -> DNS (dns.json)
│   │   ├── 67 -> DHCP (dhcp.json) [Server]
│   │   ├── 68 -> DHCP (dhcp.json) [Client]
│   │   └── 80 -> HTTP (http.json)
│   └── 58   -> ICMPv6 (icmpv6.json)
├── 0x8100 -> VLAN (vlan.json)
│   ├── 0x0800 -> IPv4 (ipv4.json)
│   ├── 0x0806 -> ARP (arp.json)
│   └── 0x86DD -> IPv6 (ipv6.json)
├── 0x8847 -> MPLS Unicast (mpls.json)
│   ├── S=0 -> MPLS (mpls.json) [Recursion]
│   └── S=1 -> Payload (mpls_payload.json) [Heuristic]
│       ├── v4 -> IPv4 (ipv4.json)
│       └── v6 -> IPv6 (ipv6.json)
├── 0x8848 -> MPLS Multicast (mpls.json)
│   ├── S=0 -> MPLS (mpls.json) [Recursion]
│   └── S=1 -> Payload (mpls_payload.json) [Heuristic]
│       ├── v4 -> IPv4 (ipv4.json)
│       └── v6 -> IPv6 (ipv6.json)
└── 0x88CC -> LLDP (lldp.json)
```

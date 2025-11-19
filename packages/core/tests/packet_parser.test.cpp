#include "../src/cpp/modules/parser/packet_parser.hpp"
#include "../src/cpp/utils/protocols/protocol_model.hpp"
#include <array>
#include <catch2/catch_test_macros.hpp>
#include <cstdint>
#include <iostream>
#include <map>

std::array<uint8_t, MAX_PACKET_SIZE> createEthernetIPv4TCPPacket() {
  std::array<uint8_t, MAX_PACKET_SIZE> packet = {};

  // Ethernet Header (14 bytes)
  // Destination MAC: AA:BB:CC:DD:EE:FF
  packet[0] = 0xAA;
  packet[1] = 0xBB;
  packet[2] = 0xCC;
  packet[3] = 0xDD;
  packet[4] = 0xEE;
  packet[5] = 0xFF;

  // Source MAC: 11:22:33:44:55:66
  packet[6] = 0x11;
  packet[7] = 0x22;
  packet[8] = 0x33;
  packet[9] = 0x44;
  packet[10] = 0x55;
  packet[11] = 0x66;

  // EtherType: 0x0800 (IPv4)
  packet[12] = 0x08;
  packet[13] = 0x00;

  // IPv4 Header (20 bytes)
  packet[14] = 0x45; // Version (4) + IHL (5)
  packet[15] = 0x00; // Type of Service
  packet[16] = 0x00;
  packet[17] = 0x34; // Total Length (52 bytes)
  packet[18] = 0x12;
  packet[19] = 0x34; // Identification
  packet[20] = 0x40;
  packet[21] = 0x00; // Flags (010) + Fragment Offset (0)
  packet[22] = 0x40; // TTL (64)
  packet[23] = 0x06; // Protocol (TCP = 6)
  packet[24] = 0xAB;
  packet[25] = 0xCD; // Header Checksum

  // Source IP: 192.168.1.1
  packet[26] = 192;
  packet[27] = 168;
  packet[28] = 1;
  packet[29] = 1;

  // Destination IP: 10.0.0.1
  packet[30] = 10;
  packet[31] = 0;
  packet[32] = 0;
  packet[33] = 1;

  // TCP Header (20 bytes)
  packet[34] = 0x1F;
  packet[35] = 0x90; // Source Port (8080)
  packet[36] = 0x00;
  packet[37] = 0x50; // Destination Port (80)
  packet[38] = 0x12;
  packet[39] = 0x34; // Sequence Number
  packet[40] = 0x56;
  packet[41] = 0x78;
  packet[42] = 0x87;
  packet[43] = 0x65; // Acknowledgment Number
  packet[44] = 0x43;
  packet[45] = 0x21;
  packet[46] = 0x50; // Data Offset (5) + Reserved (000)
  packet[47] = 0x18; // Flags (ACK + PSH)
  packet[48] = 0x20;
  packet[49] = 0x00; // Window Size (8192)
  packet[50] = 0xEF;
  packet[51] = 0xBE; // Checksum
  packet[52] = 0x00;
  packet[53] = 0x00; // Urgent Pointer

  return packet;
}

std::array<uint8_t, MAX_PACKET_SIZE> createEthernetARPPacket() {
  std::array<uint8_t, MAX_PACKET_SIZE> packet = {};

  // Ethernet Header (14 bytes)
  // Destination MAC: FF:FF:FF:FF:FF:FF (broadcast)
  packet[0] = 0xFF;
  packet[1] = 0xFF;
  packet[2] = 0xFF;
  packet[3] = 0xFF;
  packet[4] = 0xFF;
  packet[5] = 0xFF;

  // Source MAC: 00:11:22:33:44:55
  packet[6] = 0x00;
  packet[7] = 0x11;
  packet[8] = 0x22;
  packet[9] = 0x33;
  packet[10] = 0x44;
  packet[11] = 0x55;

  // EtherType: 0x0806 (ARP)
  packet[12] = 0x08;
  packet[13] = 0x06;

  // ARP Header (28 bytes)
  packet[14] = 0x00;
  packet[15] = 0x01; // Hardware Type (Ethernet)
  packet[16] = 0x08;
  packet[17] = 0x00; // Protocol Type (IPv4)
  packet[18] = 0x06; // Hardware Address Length
  packet[19] = 0x04; // Protocol Address Length
  packet[20] = 0x00;
  packet[21] = 0x01; // Operation (ARP Request)

  // Sender Hardware Address (MAC): 00:11:22:33:44:55
  packet[22] = 0x00;
  packet[23] = 0x11;
  packet[24] = 0x22;
  packet[25] = 0x33;
  packet[26] = 0x44;
  packet[27] = 0x55;

  // Sender Protocol Address (IP): 192.168.1.100
  packet[28] = 192;
  packet[29] = 168;
  packet[30] = 1;
  packet[31] = 100;

  // Target Hardware Address (MAC): 00:00:00:00:00:00 (unknown)
  packet[32] = 0x00;
  packet[33] = 0x00;
  packet[34] = 0x00;
  packet[35] = 0x00;
  packet[36] = 0x00;
  packet[37] = 0x00;

  // Target Protocol Address (IP): 192.168.1.1
  packet[38] = 192;
  packet[39] = 168;
  packet[40] = 1;
  packet[41] = 1;

  return packet;
}

void printProtocolFields(
    const std::vector<std::unique_ptr<ProtocolModel>> &protocols) {
  for (const auto &protocol : protocols) {
    std::cout << "\n=== " << protocol->getName()
              << " PROTOCOL ===" << std::endl;
    const auto &fields = protocol->getFields();
    for (const auto &field : fields) {
      std::cout << field.name << ": " << field.toString() << std::endl;
    }
  }
}

TEST_CASE("PacketParser - Ethernet + IPv4 + TCP Packet", "[parser]") {
  auto packet = createEthernetIPv4TCPPacket();

  PacketParser parser;
  auto protocols = parser.parse(packet);

  REQUIRE(protocols.size() == 3);
  printProtocolFields(protocols);

  // Test Ethernet Protocol
  REQUIRE(protocols[0]->getName() == "Ethernet");
  REQUIRE(protocols[0]->getProtocolType() == ProtocolType::ETHERNET);

  const auto &ethernet_fields = protocols[0]->getFields();
  REQUIRE(ethernet_fields.size() == 3);

  // Verify all Ethernet field values
  REQUIRE(ethernet_fields[0].toString() == "AA BB CC DD EE FF"); // dest_mac
  REQUIRE(ethernet_fields[1].toString() == "11 22 33 44 55 66"); // src_mac
  REQUIRE(ethernet_fields[2].toString() == "08 00");             // ethertype

  // Test IPv4 Protocol
  REQUIRE(protocols[1]->getName() == "IPv4");
  REQUIRE(protocols[1]->getProtocolType() == ProtocolType::IPV4);

  const auto &ipv4_fields = protocols[1]->getFields();
  REQUIRE(ipv4_fields.size() == 12);

  // Verify all IPv4 field values
  std::map<std::string, std::string> expected_ipv4 = {
      {"version", "4"},
      {"ihl", "5"},
      {"tos", "00"},
      {"total_length", "00 34"},
      {"identification", "12 34"},
      {"flags", "2"},
      {"fragment_offset", "00 00"},
      {"ttl", "40"},
      {"protocol", "06"},
      {"checksum", "AB CD"},
      {"src_ip", "C0 A8 01 01"},
      {"dest_ip", "0A 00 00 01"}};

  for (const auto &field : ipv4_fields) {
    REQUIRE(expected_ipv4.find(field.name) != expected_ipv4.end());
    REQUIRE(field.toString() == expected_ipv4[field.name]);
  }

  // Test TCP Protocol
  REQUIRE(protocols[2]->getName() == "TCP");
  REQUIRE(protocols[2]->getProtocolType() == ProtocolType::TCP);

  const auto &tcp_fields = protocols[2]->getFields();
  REQUIRE(tcp_fields.size() == 10);

  // Verify all TCP field values
  std::map<std::string, std::string> expected_tcp = {
      {"src_port", "1F 90"},
      {"dest_port", "00 50"},
      {"sequence_number", "12 34 56 78"},
      {"ack_number", "87 65 43 21"},
      {"data_offset", "5"},
      {"reserved", "0"},
      {"flags", "18"},
      {"window_size", "20 00"},
      {"checksum", "EF BE"},
      {"urgent_pointer", "00 00"}};

  for (const auto &field : tcp_fields) {
    REQUIRE(expected_tcp.find(field.name) != expected_tcp.end());
    REQUIRE(field.toString() == expected_tcp[field.name]);
  }
}

TEST_CASE("PacketParser - Ethernet + ARP Packet", "[parser]") {
  auto packet = createEthernetARPPacket();

  PacketParser parser;
  auto protocols = parser.parse(packet);

  REQUIRE(protocols.size() == 2);
  printProtocolFields(protocols);

  // Test Ethernet Protocol
  REQUIRE(protocols[0]->getName() == "Ethernet");
  REQUIRE(protocols[0]->getProtocolType() == ProtocolType::ETHERNET);

  const auto &ethernet_fields = protocols[0]->getFields();
  REQUIRE(ethernet_fields.size() == 3);

  // Verify all Ethernet field values
  REQUIRE(ethernet_fields[0].toString() == "FF FF FF FF FF FF"); // dest_mac
  REQUIRE(ethernet_fields[1].toString() == "00 11 22 33 44 55"); // src_mac
  REQUIRE(ethernet_fields[2].toString() == "08 06");             // ethertype

  // Test ARP Protocol
  REQUIRE(protocols[1]->getName() == "ARP");
  REQUIRE(protocols[1]->getProtocolType() == ProtocolType::ARP);

  const auto &arp_fields = protocols[1]->getFields();
  REQUIRE(arp_fields.size() == 9);

  // Verify all ARP field values
  std::map<std::string, std::string> expected_arp = {
      {"hardware_type", "00 01"},   {"protocol_type", "08 00"},
      {"hardware_size", "06"},      {"protocol_size", "04"},
      {"opcode", "00 01"},          {"sender_mac", "00 11 22 33 44 55"},
      {"sender_ip", "C0 A8 01 64"}, {"target_mac", "00 00 00 00 00 00"},
      {"target_ip", "C0 A8 01 01"}};

  for (const auto &field : arp_fields) {
    REQUIRE(expected_arp.find(field.name) != expected_arp.end());
    REQUIRE(field.toString() == expected_arp[field.name]);
  }
}

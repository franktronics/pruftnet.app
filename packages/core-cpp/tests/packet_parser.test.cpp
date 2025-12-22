#include "../src/cpp/modules/parser/packet_parser.hpp"
#include <array>
#include <catch2/catch_test_macros.hpp>
#include <cstdint>
#include <iostream>

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
  packet[15] = 0x00; // TOS
  packet[16] = 0x00;
  packet[17] = 0x34; // Total Length (52 bytes)
  packet[18] = 0x12;
  packet[19] = 0x34; // Identification
  packet[20] = 0x40;
  packet[21] = 0x00; // Flags + Fragment Offset
  packet[22] = 0x40; // TTL (64)
  packet[23] = 0x06; // Protocol (TCP = 6)
  packet[24] = 0xAB;
  packet[25] = 0xCD; // Checksum

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
  packet[39] = 0x34;
  packet[40] = 0x56;
  packet[41] = 0x78; // Sequence Number
  packet[42] = 0x87;
  packet[43] = 0x65;
  packet[44] = 0x43;
  packet[45] = 0x21; // Ack Number
  packet[46] = 0x50; // Data Offset (5) + Reserved
  packet[47] = 0x18; // Flags (ACK + PSH)
  packet[48] = 0x20;
  packet[49] = 0x00; // Window Size
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
  packet[18] = 0x06; // Hardware Size
  packet[19] = 0x04; // Protocol Size
  packet[20] = 0x00;
  packet[21] = 0x01; // Opcode (ARP Request)

  // Sender MAC: 00:11:22:33:44:55
  packet[22] = 0x00;
  packet[23] = 0x11;
  packet[24] = 0x22;
  packet[25] = 0x33;
  packet[26] = 0x44;
  packet[27] = 0x55;

  // Sender IP: 192.168.1.100
  packet[28] = 192;
  packet[29] = 168;
  packet[30] = 1;
  packet[31] = 100;

  // Target MAC: 00:00:00:00:00:00 (unknown)
  packet[32] = 0x00;
  packet[33] = 0x00;
  packet[34] = 0x00;
  packet[35] = 0x00;
  packet[36] = 0x00;
  packet[37] = 0x00;

  // Target IP: 192.168.1.1
  packet[38] = 192;
  packet[39] = 168;
  packet[40] = 1;
  packet[41] = 1;

  return packet;
}

std::array<uint8_t, MAX_PACKET_SIZE> createEthernetIPv4UDPPacket() {
  std::array<uint8_t, MAX_PACKET_SIZE> packet = {};

  // Ethernet Header
  packet[0] = 0xAA;
  packet[1] = 0xBB;
  packet[2] = 0xCC;
  packet[3] = 0xDD;
  packet[4] = 0xEE;
  packet[5] = 0xFF;
  packet[6] = 0x11;
  packet[7] = 0x22;
  packet[8] = 0x33;
  packet[9] = 0x44;
  packet[10] = 0x55;
  packet[11] = 0x66;
  packet[12] = 0x08;
  packet[13] = 0x00; // IPv4

  // IPv4 Header
  packet[14] = 0x45; // Version + IHL
  packet[15] = 0x00;
  packet[16] = 0x00;
  packet[17] = 0x1C; // Total Length
  packet[18] = 0x00;
  packet[19] = 0x00;
  packet[20] = 0x40;
  packet[21] = 0x00;
  packet[22] = 0x40;
  packet[23] = 0x11; // Protocol (UDP = 17)
  packet[24] = 0x00;
  packet[25] = 0x00;
  packet[26] = 192;
  packet[27] = 168;
  packet[28] = 1;
  packet[29] = 1;
  packet[30] = 10;
  packet[31] = 0;
  packet[32] = 0;
  packet[33] = 1;

  // UDP Header
  packet[34] = 0x00;
  packet[35] = 0x35; // Source Port (53 - DNS)
  packet[36] = 0x00;
  packet[37] = 0x35; // Dest Port (53)
  packet[38] = 0x00;
  packet[39] = 0x08; // Length
  packet[40] = 0x00;
  packet[41] = 0x00; // Checksum

  return packet;
}

void printParsedPacket(const ParsedPacket& parsed, const RawPacket& raw) {
  std::cout << "\n=== Parsed Packet ===" << std::endl;
  std::cout << "Protocol count: " << static_cast<int>(parsed.protocol_count) << std::endl;
  std::cout << "Valid: " << (parsed.valid ? "true" : "false") << std::endl;

  for (uint8_t i = 0; i < parsed.protocol_count; ++i) {
    const ProtocolEntry& proto = parsed.protocols[i];
    std::cout << "\n--- Protocol " << static_cast<int>(i) << " ---" << std::endl;
    std::cout << "  ID: " << static_cast<int>(static_cast<uint8_t>(proto.protocol_id)) << std::endl;
    std::cout << "  Header offset: " << proto.header_offset << std::endl;
    std::cout << "  Field count: " << static_cast<int>(proto.field_count) << std::endl;

    for (uint8_t j = 0; j < proto.field_count; ++j) {
      const FieldEntry& field = proto.fields[j];
      std::cout << "    Field " << static_cast<int>(field.field_id) << ": offset=" << field.byte_offset
                << ", length=" << static_cast<int>(field.byte_length) << ", value=";

      for (uint8_t k = 0; k < field.byte_length && (field.byte_offset + k) < raw.length; ++k) {
        printf("%02X ", raw.data[field.byte_offset + k]);
      }
      std::cout << std::endl;
    }
  }
}

TEST_CASE("PacketParser - Ethernet + IPv4 + TCP", "[parser]") {
  auto packet_data = createEthernetIPv4TCPPacket();

  RawPacket raw;
  raw.data = packet_data;
  raw.length = 54;
  raw.valid = true;

  PacketParser parser;
  ParsedPacket parsed = parser.parsePacket(raw);

  printParsedPacket(parsed, raw);

  REQUIRE(parsed.valid == true);
  REQUIRE(parsed.protocol_count == 3);

  REQUIRE(parsed.protocols[0].protocol_id == ProtocolId::ETHERNET);
  REQUIRE(parsed.protocols[0].header_offset == 0);
  REQUIRE(parsed.protocols[0].field_count == 3);

  REQUIRE(parsed.protocols[1].protocol_id == ProtocolId::IPV4);
  REQUIRE(parsed.protocols[1].header_offset == 14);
  REQUIRE(parsed.protocols[1].field_count == 13);

  REQUIRE(parsed.protocols[2].protocol_id == ProtocolId::TCP);
  REQUIRE(parsed.protocols[2].header_offset == 34);
  REQUIRE(parsed.protocols[2].field_count == 10);
}

TEST_CASE("PacketParser - Ethernet + ARP", "[parser]") {
  auto packet_data = createEthernetARPPacket();

  RawPacket raw;
  raw.data = packet_data;
  raw.length = 42;
  raw.valid = true;

  PacketParser parser;
  ParsedPacket parsed = parser.parsePacket(raw);

  printParsedPacket(parsed, raw);

  REQUIRE(parsed.valid == true);
  REQUIRE(parsed.protocol_count == 2);

  REQUIRE(parsed.protocols[0].protocol_id == ProtocolId::ETHERNET);
  REQUIRE(parsed.protocols[0].header_offset == 0);

  REQUIRE(parsed.protocols[1].protocol_id == ProtocolId::ARP);
  REQUIRE(parsed.protocols[1].header_offset == 14);
  REQUIRE(parsed.protocols[1].field_count == 9);
}

TEST_CASE("PacketParser - Ethernet + IPv4 + UDP", "[parser]") {
  auto packet_data = createEthernetIPv4UDPPacket();

  RawPacket raw;
  raw.data = packet_data;
  raw.length = 42;
  raw.valid = true;

  PacketParser parser;
  ParsedPacket parsed = parser.parsePacket(raw);

  printParsedPacket(parsed, raw);

  REQUIRE(parsed.valid == true);
  REQUIRE(parsed.protocol_count == 3);

  REQUIRE(parsed.protocols[0].protocol_id == ProtocolId::ETHERNET);
  REQUIRE(parsed.protocols[1].protocol_id == ProtocolId::IPV4);
  REQUIRE(parsed.protocols[2].protocol_id == ProtocolId::UDP);
  REQUIRE(parsed.protocols[2].field_count == 4);
}

TEST_CASE("PacketParser - Invalid packet", "[parser]") {
  RawPacket raw;
  raw.length = 0;
  raw.valid = false;

  PacketParser parser;
  ParsedPacket parsed = parser.parsePacket(raw);

  REQUIRE(parsed.valid == false);
  REQUIRE(parsed.protocol_count == 0);
}

TEST_CASE("PacketParser - Truncated packet", "[parser]") {
  auto packet_data = createEthernetIPv4TCPPacket();

  RawPacket raw;
  raw.data = packet_data;
  raw.length = 10; // Too short for Ethernet header
  raw.valid = true;

  PacketParser parser;
  ParsedPacket parsed = parser.parsePacket(raw);

  REQUIRE(parsed.valid == false);
  REQUIRE(parsed.protocol_count == 0);
}

TEST_CASE("PacketParser - Field extraction", "[parser]") {
  auto packet_data = createEthernetIPv4TCPPacket();

  RawPacket raw;
  raw.data = packet_data;
  raw.length = 54;
  raw.valid = true;

  PacketParser parser;
  ParsedPacket parsed = parser.parsePacket(raw);

  REQUIRE(parsed.valid == true);

  // Ethernet dest_mac field
  const FieldEntry& dest_mac = parsed.protocols[0].fields[EthernetFields::DEST_MAC];
  REQUIRE(dest_mac.byte_offset == 0);
  REQUIRE(dest_mac.byte_length == 6);
  REQUIRE(raw.data[dest_mac.byte_offset] == 0xAA);
  REQUIRE(raw.data[dest_mac.byte_offset + 5] == 0xFF);

  // Ethernet ethertype field
  const FieldEntry& ethertype = parsed.protocols[0].fields[EthernetFields::ETHERTYPE];
  REQUIRE(ethertype.byte_offset == 12);
  REQUIRE(ethertype.byte_length == 2);
  REQUIRE(raw.data[ethertype.byte_offset] == 0x08);
  REQUIRE(raw.data[ethertype.byte_offset + 1] == 0x00);

  // IPv4 src_ip field
  const FieldEntry& src_ip = parsed.protocols[1].fields[Ipv4Fields::SRC_IP];
  REQUIRE(src_ip.byte_offset == 26);
  REQUIRE(src_ip.byte_length == 4);
  REQUIRE(raw.data[src_ip.byte_offset] == 192);
  REQUIRE(raw.data[src_ip.byte_offset + 1] == 168);

  // TCP src_port field
  const FieldEntry& src_port = parsed.protocols[2].fields[TcpFields::SRC_PORT];
  REQUIRE(src_port.byte_offset == 34);
  REQUIRE(src_port.byte_length == 2);
  REQUIRE(raw.data[src_port.byte_offset] == 0x1F);
  REQUIRE(raw.data[src_port.byte_offset + 1] == 0x90);
}

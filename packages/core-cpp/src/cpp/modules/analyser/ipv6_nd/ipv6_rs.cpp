#include "ipv6_rs.hpp"
#include <chrono>
#include <cstring>
#include <iostream>
#include <thread>

IPv6RouterSolicitation::IPv6RouterSolicitation() : NeighborDiscovery() {}

IPv6RouterSolicitation::~IPv6RouterSolicitation() {}

std::array<uint8_t, MAX_PACKET_SIZE>
IPv6RouterSolicitation::buildRSPacket() {
  std::array<uint8_t, MAX_PACKET_SIZE> packet = {};
  size_t offset = 0;

  auto source_ip_bytes = parseIPv6Address(source_ipv6_);
  std::array<uint8_t, 16> all_routers_ip = {0xff, 0x02, 0x00, 0x00, 0x00, 0x00,
                                            0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
                                            0x00, 0x00, 0x00, 0x02};
  std::array<uint8_t, 6> all_routers_mac = {0x33, 0x33, 0x00,
                                            0x00, 0x00, 0x02};

  std::memcpy(&packet[offset], all_routers_mac.data(), 6);
  offset += 6;
  std::memcpy(&packet[offset], source_mac_.data(), 6);
  offset += 6;
  packet[offset++] = 0x86;
  packet[offset++] = 0xDD;

  packet[offset++] = 0x60;
  packet[offset++] = 0x00;
  packet[offset++] = 0x00;
  packet[offset++] = 0x00;

  uint16_t payload_length = 16;
  packet[offset++] = (payload_length >> 8) & 0xFF;
  packet[offset++] = payload_length & 0xFF;

  packet[offset++] = 58;
  packet[offset++] = 255;

  std::memcpy(&packet[offset], source_ip_bytes.data(), 16);
  offset += 16;
  std::memcpy(&packet[offset], all_routers_ip.data(), 16);
  offset += 16;

  size_t icmpv6_start = offset;

  packet[offset++] = 133;
  packet[offset++] = 0;
  packet[offset++] = 0;
  packet[offset++] = 0;

  packet[offset++] = 0;
  packet[offset++] = 0;
  packet[offset++] = 0;
  packet[offset++] = 0;

  packet[offset++] = 1;
  packet[offset++] = 1;
  std::memcpy(&packet[offset], source_mac_.data(), 6);
  offset += 6;

  uint16_t checksum =
      calculateICMPv6Checksum(packet, 14, icmpv6_start, payload_length);
  packet[icmpv6_start + 2] = (checksum >> 8) & 0xFF;
  packet[icmpv6_start + 3] = checksum & 0xFF;

  return packet;
}

void IPv6RouterSolicitation::sendWorker(const std::string &interface_name) {
  auto packet = buildRSPacket();

  std::cout << "Sending Router Solicitation to ff02::2..." << std::endl;

  if (!sendPacket(packet.data(), 14 + 40 + 16, interface_name)) {
    std::cerr << "Failed to send RS packet" << std::endl;
  } else {
    std::cout << "RS packet sent successfully" << std::endl;
  }

  is_running_.store(false);
}

bool IPv6RouterSolicitation::analyze(std::string &interface_name) {
  if (is_running_.load()) {
    std::cerr << "Analysis already running" << std::endl;
    return false;
  }

  if (source_ipv6_.empty()) {
    std::cerr << "Source IPv6 address must be set" << std::endl;
    return false;
  }

  if (!createRawSocket()) {
    return false;
  }

  should_stop_.store(false);
  is_running_.store(true);

  send_thread_ =
      std::thread(&IPv6RouterSolicitation::sendWorker, this, interface_name);

  return true;
}

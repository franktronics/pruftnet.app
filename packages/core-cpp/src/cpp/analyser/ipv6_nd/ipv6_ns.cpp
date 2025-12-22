#include "ipv6_ns.hpp"
#include <chrono>
#include <cstring>
#include <iostream>
#include <thread>

IPv6NeighborSolicitation::IPv6NeighborSolicitation() : NeighborDiscovery() {}

IPv6NeighborSolicitation::~IPv6NeighborSolicitation() {}

void IPv6NeighborSolicitation::setTargetIPv6(const std::string& target_ipv6) {
  target_ipv6_ = target_ipv6;
}

std::array<uint8_t, 6> IPv6NeighborSolicitation::calculateSolicitedNodeMAC(const std::string& target_ipv6) {
  auto ipv6_bytes = parseIPv6Address(target_ipv6);
  std::array<uint8_t, 6> mac = {0x33, 0x33, 0xff, ipv6_bytes[13], ipv6_bytes[14], ipv6_bytes[15]};
  return mac;
}

std::array<uint8_t, MAX_PACKET_SIZE> IPv6NeighborSolicitation::buildNSPacket() {
  std::array<uint8_t, MAX_PACKET_SIZE> packet = {};
  size_t offset = 0;

  auto dest_mac = calculateSolicitedNodeMAC(target_ipv6_);
  auto target_ip_bytes = parseIPv6Address(target_ipv6_);
  auto source_ip_bytes = parseIPv6Address(source_ipv6_);

  std::memcpy(&packet[offset], dest_mac.data(), 6);
  offset += 6;
  std::memcpy(&packet[offset], source_mac_.data(), 6);
  offset += 6;
  packet[offset++] = 0x86;
  packet[offset++] = 0xDD;

  packet[offset++] = 0x60;
  packet[offset++] = 0x00;
  packet[offset++] = 0x00;
  packet[offset++] = 0x00;

  uint16_t payload_length = 32;
  packet[offset++] = (payload_length >> 8) & 0xFF;
  packet[offset++] = payload_length & 0xFF;

  packet[offset++] = 58;
  packet[offset++] = 255;

  std::memcpy(&packet[offset], source_ip_bytes.data(), 16);
  offset += 16;
  std::memcpy(&packet[offset], target_ip_bytes.data(), 16);
  offset += 16;

  size_t icmpv6_start = offset;

  packet[offset++] = 135;
  packet[offset++] = 0;
  packet[offset++] = 0;
  packet[offset++] = 0;

  packet[offset++] = 0;
  packet[offset++] = 0;
  packet[offset++] = 0;
  packet[offset++] = 0;

  std::memcpy(&packet[offset], target_ip_bytes.data(), 16);
  offset += 16;

  packet[offset++] = 1;
  packet[offset++] = 1;
  std::memcpy(&packet[offset], source_mac_.data(), 6);
  offset += 6;

  uint16_t checksum = calculateICMPv6Checksum(packet, 14, icmpv6_start, payload_length);
  packet[icmpv6_start + 2] = (checksum >> 8) & 0xFF;
  packet[icmpv6_start + 3] = checksum & 0xFF;

  return packet;
}

void IPv6NeighborSolicitation::sendWorker(const std::string& interface_name) {
  auto packet = buildNSPacket();

  std::cout << "Sending Neighbor Solicitation to " << target_ipv6_ << "..." << std::endl;

  if (!sendPacket(packet.data(), 14 + 40 + 32, interface_name)) {
    std::cerr << "Failed to send NS packet" << std::endl;
  } else {
    std::cout << "NS packet sent successfully" << std::endl;
  }

  is_running_.store(false);
}

bool IPv6NeighborSolicitation::analyze(std::string& interface_name) {
  if (is_running_.load()) {
    std::cerr << "Analysis already running" << std::endl;
    return false;
  }

  if (target_ipv6_.empty() || source_ipv6_.empty()) {
    std::cerr << "Target and source IPv6 addresses must be set" << std::endl;
    return false;
  }

  if (!createRawSocket()) {
    return false;
  }

  should_stop_.store(false);
  is_running_.store(true);

  send_thread_ = std::thread(&IPv6NeighborSolicitation::sendWorker, this, interface_name);

  return true;
}

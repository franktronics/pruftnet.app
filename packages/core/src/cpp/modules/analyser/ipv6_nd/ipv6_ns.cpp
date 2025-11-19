#include "ipv6_ns.hpp"
#include <arpa/inet.h>
#include <chrono>
#include <cstring>
#include <errno.h>
#include <iostream>
#include <linux/if_packet.h>
#include <net/ethernet.h>
#include <net/if.h>
#include <sys/ioctl.h>
#include <thread>
#include <unistd.h>

IPv6NeighborSolicitation::IPv6NeighborSolicitation()
    : raw_socket_(-1), is_running_(false),
      should_stop_(false) {}

IPv6NeighborSolicitation::~IPv6NeighborSolicitation() {
  stop();
  if (raw_socket_ != -1) {
    close(raw_socket_);
  }
}

void IPv6NeighborSolicitation::setTargetIPv6(const std::string &target_ipv6) {
  target_ipv6_ = target_ipv6;
}

void IPv6NeighborSolicitation::setSourceIPv6(const std::string &source_ipv6) {
  source_ipv6_ = source_ipv6;
}

void IPv6NeighborSolicitation::setSourceMAC(
    const std::array<uint8_t, 6> &source_mac) {
  source_mac_ = source_mac;
}

bool IPv6NeighborSolicitation::createRawSocket() {
  raw_socket_ = socket(AF_PACKET, SOCK_RAW, htons(ETH_P_ALL));

  if (raw_socket_ < 0) {
    std::cerr << "Error creating raw socket: " << strerror(errno) << std::endl;
    std::cerr << "Note: Raw sockets require root privileges" << std::endl;
    return false;
  }

  return true;
}

int IPv6NeighborSolicitation::getInterfaceIndex(
    const std::string &interface_name) {
  struct ifreq ifr;
  memset(&ifr, 0, sizeof(ifr));
  strncpy(ifr.ifr_name, interface_name.c_str(), IFNAMSIZ - 1);

  if (ioctl(raw_socket_, SIOCGIFINDEX, &ifr) < 0) {
    std::cerr << "Error getting interface index for " << interface_name << ": "
              << strerror(errno) << std::endl;
    return -1;
  }

  return ifr.ifr_ifindex;
}

std::array<uint8_t, 16>
IPv6NeighborSolicitation::parseIPv6Address(const std::string &ipv6_str) {
  std::array<uint8_t, 16> result = {};
  struct in6_addr addr;

  if (inet_pton(AF_INET6, ipv6_str.c_str(), &addr) == 1) {
    std::memcpy(result.data(), &addr, 16);
  }

  return result;
}

std::array<uint8_t, 6> IPv6NeighborSolicitation::calculateSolicitedNodeMAC(
    const std::string &target_ipv6) {
  auto ipv6_bytes = parseIPv6Address(target_ipv6);
  std::array<uint8_t, 6> mac = {0x33,           0x33,           0xff,
                                ipv6_bytes[13], ipv6_bytes[14], ipv6_bytes[15]};
  return mac;
}

uint16_t IPv6NeighborSolicitation::calculateICMPv6Checksum(
    const std::array<uint8_t, MAX_PACKET_SIZE> &packet, size_t ipv6_offset,
    size_t icmpv6_offset, size_t icmpv6_length) {
  uint32_t sum = 0;

  auto src_ip = ipv6_offset + 8;
  auto dst_ip = ipv6_offset + 24;

  for (size_t i = 0; i < 16; i += 2) {
    sum += (packet[src_ip + i] << 8) | packet[src_ip + i + 1];
    sum += (packet[dst_ip + i] << 8) | packet[dst_ip + i + 1];
  }

  sum += icmpv6_length;
  sum += 58;

  for (size_t i = 0; i < icmpv6_length; i += 2) {
    if (i + 1 < icmpv6_length) {
      sum += (packet[icmpv6_offset + i] << 8) | packet[icmpv6_offset + i + 1];
    } else {
      sum += packet[icmpv6_offset + i] << 8;
    }
  }

  while (sum >> 16) {
    sum = (sum & 0xFFFF) + (sum >> 16);
  }

  return ~sum;
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

  uint16_t checksum =
      calculateICMPv6Checksum(packet, 14, icmpv6_start, payload_length);
  packet[icmpv6_start + 2] = (checksum >> 8) & 0xFF;
  packet[icmpv6_start + 3] = checksum & 0xFF;

  return packet;
}

bool IPv6NeighborSolicitation::sendPacket(const uint8_t *packet, size_t length,
                                          const std::string &interface_name) {
  int interface_index = getInterfaceIndex(interface_name);
  if (interface_index < 0) {
    return false;
  }

  struct sockaddr_ll socket_address;
  memset(&socket_address, 0, sizeof(socket_address));
  socket_address.sll_family = AF_PACKET;
  socket_address.sll_protocol = htons(ETH_P_ALL);
  socket_address.sll_ifindex = interface_index;
  socket_address.sll_halen = 6;

  ssize_t sent = sendto(raw_socket_, packet, length, 0,
                        reinterpret_cast<struct sockaddr *>(&socket_address),
                        sizeof(socket_address));

  if (sent < 0) {
    std::cerr << "Error sending packet: " << strerror(errno) << std::endl;
    return false;
  }

  return true;
}

void IPv6NeighborSolicitation::sendWorker(const std::string &interface_name) {
  auto packet = buildNSPacket();

  std::cout << "Sending Neighbor Solicitation to " << target_ipv6_ << "..."
            << std::endl;

  if (!sendPacket(packet.data(), 14 + 40 + 32, interface_name)) {
    std::cerr << "Failed to send NS packet" << std::endl;
  } else {
    std::cout << "NS packet sent successfully" << std::endl;
  }

  is_running_.store(false);
}

bool IPv6NeighborSolicitation::analyze(std::string &interface_name) {
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

  send_thread_ =
      std::thread(&IPv6NeighborSolicitation::sendWorker, this, interface_name);

  return true;
}

void IPv6NeighborSolicitation::stop() {
  should_stop_.store(true);

  if (send_thread_.joinable()) {
    send_thread_.join();
  }

  is_running_.store(false);
}

bool IPv6NeighborSolicitation::isRunning() const { return is_running_.load(); }

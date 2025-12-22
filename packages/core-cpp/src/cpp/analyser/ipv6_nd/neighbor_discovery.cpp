#include "neighbor_discovery.hpp"
#include <arpa/inet.h>
#include <cstring>
#include <errno.h>
#include <iostream>
#include <linux/if_packet.h>
#include <net/ethernet.h>
#include <net/if.h>
#include <sys/ioctl.h>
#include <unistd.h>

NeighborDiscovery::NeighborDiscovery() : raw_socket_(-1), is_running_(false), should_stop_(false) {
  source_mac_ = {0, 0, 0, 0, 0, 0};
}

NeighborDiscovery::~NeighborDiscovery() {
  stop();
  if (raw_socket_ != -1) {
    close(raw_socket_);
  }
}

void NeighborDiscovery::setSourceIPv6(const std::string& source_ipv6) {
  source_ipv6_ = source_ipv6;
}

void NeighborDiscovery::setSourceMAC(const std::array<uint8_t, 6>& source_mac) {
  source_mac_ = source_mac;
}

bool NeighborDiscovery::createRawSocket() {
  raw_socket_ = socket(AF_PACKET, SOCK_RAW, htons(ETH_P_ALL));

  if (raw_socket_ < 0) {
    std::cerr << "Error creating raw socket: " << strerror(errno) << std::endl;
    std::cerr << "Note: Raw sockets require root privileges" << std::endl;
    return false;
  }

  return true;
}

int NeighborDiscovery::getInterfaceIndex(const std::string& interface_name) {
  struct ifreq ifr;
  memset(&ifr, 0, sizeof(ifr));
  strncpy(ifr.ifr_name, interface_name.c_str(), IFNAMSIZ - 1);

  if (ioctl(raw_socket_, SIOCGIFINDEX, &ifr) < 0) {
    std::cerr << "Error getting interface index for " << interface_name << ": " << strerror(errno) << std::endl;
    return -1;
  }

  return ifr.ifr_ifindex;
}

bool NeighborDiscovery::sendPacket(const uint8_t* packet, size_t length, const std::string& interface_name) {
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

  ssize_t sent = sendto(raw_socket_, packet, length, 0, reinterpret_cast<struct sockaddr*>(&socket_address),
                        sizeof(socket_address));

  if (sent < 0) {
    std::cerr << "Error sending packet: " << strerror(errno) << std::endl;
    return false;
  }

  return true;
}

std::array<uint8_t, 16> NeighborDiscovery::parseIPv6Address(const std::string& ipv6_str) {
  std::array<uint8_t, 16> result = {};
  struct in6_addr addr;

  if (inet_pton(AF_INET6, ipv6_str.c_str(), &addr) == 1) {
    std::memcpy(result.data(), &addr, 16);
  }

  return result;
}

uint16_t NeighborDiscovery::calculateICMPv6Checksum(const std::array<uint8_t, MAX_PACKET_SIZE>& packet,
                                                    size_t ipv6_offset, size_t icmpv6_offset, size_t icmpv6_length) {
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

void NeighborDiscovery::stop() {
  should_stop_.store(true);

  if (send_thread_.joinable()) {
    send_thread_.join();
  }

  is_running_.store(false);
}

bool NeighborDiscovery::isRunning() const {
  return is_running_.load();
}

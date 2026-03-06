#include "ipv6rs_injector.hpp"
#include <algorithm>
#include <arpa/inet.h>
#include <cstring>
#include <errno.h>
#include <iostream>
#include <net/if.h>
#include <netinet/icmp6.h>
#include <netinet/in.h>
#include <sys/ioctl.h>
#include <unistd.h>

Ipv6RsInjector::Ipv6RsInjector()
    : interface_name_(""), raw_socket_(-1), is_initialized_(false), if_index_(0), source_mac_("") {}

Ipv6RsInjector::~Ipv6RsInjector() {
  close();
}

bool Ipv6RsInjector::initialize(const std::string& interface_name) {
  if (is_initialized_.load()) {
    return false;
  }

  if (interface_name.empty()) {
    std::cerr << "Ipv6RsInjector: Interface name is required" << std::endl;
    return false;
  }

  interface_name_ = interface_name;

  if_index_ = if_nametoindex(interface_name_.c_str());
  if (if_index_ == 0) {
    std::cerr << "Ipv6RsInjector: Invalid interface name: " << interface_name_ << std::endl;
    return false;
  }

  if (!retrieveInterfaceInfo()) {
    return false;
  }

  if (!createRawSocket()) {
    return false;
  }

  if (!bindToInterface()) {
    ::close(raw_socket_);
    raw_socket_ = -1;
    return false;
  }

  is_initialized_.store(true);
  return true;
}

bool Ipv6RsInjector::send() {
  if (!is_initialized_.load()) {
    std::cerr << "Ipv6RsInjector: Cannot send packet, injector not initialized" << std::endl;
    return false;
  }

  uint8_t packet[16];
  memset(packet, 0, sizeof(packet));

  packet[0] = 133;
  packet[1] = 0;
  packet[2] = 0;
  packet[3] = 0;

  packet[4] = 0;
  packet[5] = 0;
  packet[6] = 0;
  packet[7] = 0;

  packet[8] = 1;
  packet[9] = 1;

  std::string clean_mac = source_mac_;
  clean_mac.erase(std::remove(clean_mac.begin(), clean_mac.end(), ':'), clean_mac.end());
  clean_mac.erase(std::remove(clean_mac.begin(), clean_mac.end(), '-'), clean_mac.end());

  for (size_t i = 0; i < 6 && i * 2 + 1 < clean_mac.length(); i++) {
    std::string byte_str = clean_mac.substr(i * 2, 2);
    packet[10 + i] = static_cast<uint8_t>(std::stoul(byte_str, nullptr, 16));
  }

  struct sockaddr_in6 dest_addr;
  memset(&dest_addr, 0, sizeof(dest_addr));
  dest_addr.sin6_family = AF_INET6;
  dest_addr.sin6_scope_id = if_index_;

  if (inet_pton(AF_INET6, "ff02::2", &dest_addr.sin6_addr) <= 0) {
    std::cerr << "Ipv6RsInjector: Failed to parse destination address ff02::2" << std::endl;
    return false;
  }

  ssize_t result =
      sendto(raw_socket_, packet, sizeof(packet), 0, reinterpret_cast<struct sockaddr*>(&dest_addr), sizeof(dest_addr));

  if (result < 0) {
    std::cerr << "Ipv6RsInjector: Error sending Router Solicitation: " << strerror(errno) << std::endl;
    return false;
  }

  return true;
}

void Ipv6RsInjector::close() {
  if (!is_initialized_.load()) {
    return;
  }

  if (raw_socket_ != -1) {
    shutdown(raw_socket_, SHUT_RDWR);
    ::close(raw_socket_);
    raw_socket_ = -1;
  }

  is_initialized_.store(false);
  interface_name_.clear();
  if_index_ = 0;
  source_mac_.clear();
}

bool Ipv6RsInjector::isInitialized() const {
  return is_initialized_.load();
}

bool Ipv6RsInjector::createRawSocket() {
  raw_socket_ = socket(AF_INET6, SOCK_RAW, IPPROTO_ICMPV6);

  if (raw_socket_ < 0) {
    std::cerr << "Ipv6RsInjector: Error creating raw ICMPv6 socket: " << strerror(errno) << std::endl;
    std::cerr << "Note: Raw sockets require root privileges" << std::endl;
    return false;
  }

  return true;
}

bool Ipv6RsInjector::bindToInterface() {
  if (setsockopt(raw_socket_, SOL_SOCKET, SO_BINDTODEVICE, interface_name_.c_str(), interface_name_.length()) < 0) {
    std::cerr << "Ipv6RsInjector: Error binding to interface " << interface_name_ << ": " << strerror(errno)
              << std::endl;
    return false;
  }

  return true;
}

bool Ipv6RsInjector::retrieveInterfaceInfo() {
  int sock = socket(AF_INET, SOCK_DGRAM, 0);
  if (sock < 0) {
    std::cerr << "Ipv6RsInjector: Failed to create socket for interface info" << std::endl;
    return false;
  }

  struct ifreq ifr;
  memset(&ifr, 0, sizeof(ifr));
  strncpy(ifr.ifr_name, interface_name_.c_str(), IFNAMSIZ - 1);

  if (ioctl(sock, SIOCGIFHWADDR, &ifr) < 0) {
    std::cerr << "Ipv6RsInjector: Failed to get MAC address for interface " << interface_name_ << ": "
              << strerror(errno) << std::endl;
    ::close(sock);
    return false;
  }

  ::close(sock);

  char mac_str[18];
  snprintf(mac_str, sizeof(mac_str), "%02x:%02x:%02x:%02x:%02x:%02x", static_cast<uint8_t>(ifr.ifr_hwaddr.sa_data[0]),
           static_cast<uint8_t>(ifr.ifr_hwaddr.sa_data[1]), static_cast<uint8_t>(ifr.ifr_hwaddr.sa_data[2]),
           static_cast<uint8_t>(ifr.ifr_hwaddr.sa_data[3]), static_cast<uint8_t>(ifr.ifr_hwaddr.sa_data[4]),
           static_cast<uint8_t>(ifr.ifr_hwaddr.sa_data[5]));

  source_mac_ = mac_str;

  if (source_mac_ == "00:00:00:00:00:00") {
    std::cerr << "Ipv6RsInjector: Invalid MAC address (00:00:00:00:00:00)" << std::endl;
    return false;
  }

  return true;
}

std::string Ipv6RsInjector::getMacAddress() const {
  return source_mac_;
}

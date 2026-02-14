#include "icmpv6_injector.hpp"
#include <arpa/inet.h>
#include <cstring>
#include <errno.h>
#include <iostream>
#include <net/if.h>
#include <netinet/icmp6.h>
#include <netinet/in.h>
#include <sys/ioctl.h>
#include <unistd.h>

Icmpv6Injector::Icmpv6Injector() : interface_name_(""), raw_socket_(-1), is_initialized_(false), if_index_(0) {}

Icmpv6Injector::~Icmpv6Injector() {
  close();
}

bool Icmpv6Injector::initialize(const std::string& interface_name) {
  if (is_initialized_.load()) {
    return false;
  }

  if (interface_name.empty()) {
    std::cerr << "Icmpv6Injector: Interface name is required" << std::endl;
    return false;
  }

  interface_name_ = interface_name;

  if_index_ = if_nametoindex(interface_name_.c_str());
  if (if_index_ == 0) {
    std::cerr << "Icmpv6Injector: Invalid interface name: " << interface_name_ << std::endl;
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

bool Icmpv6Injector::send(const std::string& target_ipv6, const uint8_t* icmpv6_data, size_t length) {
  if (!is_initialized_.load()) {
    std::cerr << "Icmpv6Injector: Cannot send packet, injector not initialized" << std::endl;
    return false;
  }

  if (icmpv6_data == nullptr || length == 0) {
    std::cerr << "Icmpv6Injector: Invalid ICMPv6 data" << std::endl;
    return false;
  }

  if (target_ipv6.empty()) {
    std::cerr << "Icmpv6Injector: Target IPv6 cannot be empty" << std::endl;
    return false;
  }

  struct sockaddr_in6 dest_addr;
  memset(&dest_addr, 0, sizeof(dest_addr));
  dest_addr.sin6_family = AF_INET6;

  if (inet_pton(AF_INET6, target_ipv6.c_str(), &dest_addr.sin6_addr) <= 0) {
    std::cerr << "Icmpv6Injector: Invalid target IPv6 address: " << target_ipv6 << std::endl;
    return false;
  }

  if (isLinkLocal(target_ipv6) || isMulticast(target_ipv6)) {
    dest_addr.sin6_scope_id = if_index_;
  } else {
    dest_addr.sin6_scope_id = 0;
  }

  ssize_t result =
      sendto(raw_socket_, icmpv6_data, length, 0, reinterpret_cast<struct sockaddr*>(&dest_addr), sizeof(dest_addr));

  if (result < 0) {
    std::cerr << "Icmpv6Injector: Error sending ICMPv6 packet: " << strerror(errno) << std::endl;
    return false;
  }

  return true;
}

void Icmpv6Injector::close() {
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
}

bool Icmpv6Injector::isInitialized() const {
  return is_initialized_.load();
}

bool Icmpv6Injector::createRawSocket() {
  raw_socket_ = socket(AF_INET6, SOCK_RAW, IPPROTO_ICMPV6);

  if (raw_socket_ < 0) {
    std::cerr << "Icmpv6Injector: Error creating raw ICMPv6 socket: " << strerror(errno) << std::endl;
    std::cerr << "Note: Raw sockets require root privileges" << std::endl;
    return false;
  }

  return true;
}

bool Icmpv6Injector::bindToInterface() {
  if (setsockopt(raw_socket_, SOL_SOCKET, SO_BINDTODEVICE, interface_name_.c_str(), interface_name_.length()) < 0) {
    std::cerr << "Icmpv6Injector: Error binding to interface " << interface_name_ << ": " << strerror(errno)
              << std::endl;
    return false;
  }

  return true;
}

bool Icmpv6Injector::isLinkLocal(const std::string& ipv6) const {
  return ipv6.length() >= 4 && (ipv6.substr(0, 4) == "fe80" || ipv6.substr(0, 4) == "FE80");
}

bool Icmpv6Injector::isMulticast(const std::string& ipv6) const {
  return ipv6.length() >= 2 && (ipv6.substr(0, 2) == "ff" || ipv6.substr(0, 2) == "FF");
}

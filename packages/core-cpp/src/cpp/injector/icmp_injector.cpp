#include "icmp_injector.hpp"
#include <arpa/inet.h>
#include <cstring>
#include <errno.h>
#include <iostream>
#include <net/if.h>
#include <netinet/in.h>
#include <sys/ioctl.h>
#include <unistd.h>

IcmpInjector::IcmpInjector() : interface_name_(""), raw_socket_(-1), is_initialized_(false) {}

IcmpInjector::~IcmpInjector() {
  close();
}

bool IcmpInjector::initialize(const std::string& interface_name) {
  if (is_initialized_.load()) {
    return false;
  }

  interface_name_ = interface_name;

  if (!createRawSocket()) {
    return false;
  }

  if (!interface_name_.empty() && !bindToInterface()) {
    ::close(raw_socket_);
    raw_socket_ = -1;
    return false;
  }

  is_initialized_.store(true);
  return true;
}

bool IcmpInjector::send(const std::string& target_ip, const uint8_t* icmp_data, size_t length) {
  if (!is_initialized_.load()) {
    std::cerr << "IcmpInjector: Cannot send packet, injector not initialized" << std::endl;
    return false;
  }

  if (icmp_data == nullptr || length == 0) {
    std::cerr << "IcmpInjector: Invalid ICMP data" << std::endl;
    return false;
  }

  if (target_ip.empty()) {
    std::cerr << "IcmpInjector: Target IP cannot be empty" << std::endl;
    return false;
  }

  struct sockaddr_in dest_addr;
  memset(&dest_addr, 0, sizeof(dest_addr));
  dest_addr.sin_family = AF_INET;

  if (inet_pton(AF_INET, target_ip.c_str(), &dest_addr.sin_addr) <= 0) {
    std::cerr << "IcmpInjector: Invalid target IP address: " << target_ip << std::endl;
    return false;
  }

  ssize_t result =
      sendto(raw_socket_, icmp_data, length, 0, reinterpret_cast<struct sockaddr*>(&dest_addr), sizeof(dest_addr));

  if (result < 0) {
    std::cerr << "IcmpInjector: Error sending ICMP packet: " << strerror(errno) << std::endl;
    return false;
  }

  return true;
}

void IcmpInjector::close() {
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
}

bool IcmpInjector::isInitialized() const {
  return is_initialized_.load();
}

bool IcmpInjector::createRawSocket() {
  raw_socket_ = socket(AF_INET, SOCK_RAW, IPPROTO_ICMP);

  if (raw_socket_ < 0) {
    std::cerr << "IcmpInjector: Error creating raw ICMP socket: " << strerror(errno) << std::endl;
    std::cerr << "Note: Raw sockets require root privileges" << std::endl;
    return false;
  }

  return true;
}

bool IcmpInjector::bindToInterface() {
  if (setsockopt(raw_socket_, SOL_SOCKET, SO_BINDTODEVICE, interface_name_.c_str(), interface_name_.length()) < 0) {
    std::cerr << "IcmpInjector: Error binding to interface " << interface_name_ << ": " << strerror(errno) << std::endl;
    return false;
  }

  return true;
}

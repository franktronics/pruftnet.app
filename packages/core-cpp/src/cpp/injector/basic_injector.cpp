#include "basic_injector.hpp"
#include <arpa/inet.h>
#include <cstring>
#include <errno.h>
#include <iostream>
#include <net/if.h>
#include <sys/ioctl.h>
#include <unistd.h>

BasicInjector::BasicInjector() : interface_name_(""), raw_socket_(-1), interface_index_(-1), is_initialized_(false) {}

BasicInjector::~BasicInjector() {
  close();
}

bool BasicInjector::initialize(const std::string& interface_name) {
  if (is_initialized_.load()) {
    return false;
  }

  interface_name_ = interface_name;

  if (!createRawSocket()) {
    return false;
  }

  interface_index_ = getInterfaceIndex();
  if (interface_index_ < 0) {
    ::close(raw_socket_);
    raw_socket_ = -1;
    return false;
  }

  is_initialized_.store(true);
  return true;
}

bool BasicInjector::send(const uint8_t* packet_data, size_t length) {
  if (!is_initialized_.load()) {
    std::cerr << "BasicInjector: Cannot send packet, injector not initialized" << std::endl;
    return false;
  }

  if (packet_data == nullptr || length == 0) {
    std::cerr << "BasicInjector: Invalid packet data" << std::endl;
    return false;
  }

  struct sockaddr_ll socket_address;
  memset(&socket_address, 0, sizeof(socket_address));
  socket_address.sll_family = AF_PACKET;
  socket_address.sll_protocol = htons(ETH_P_ALL);
  socket_address.sll_ifindex = interface_index_;

  ssize_t result = sendto(raw_socket_, packet_data, length, 0, reinterpret_cast<struct sockaddr*>(&socket_address),
                          sizeof(socket_address));

  if (result < 0) {
    std::cerr << "BasicInjector: Error sending packet: " << strerror(errno) << std::endl;
    return false;
  }

  return true;
}

void BasicInjector::close() {
  if (!is_initialized_.load()) {
    return;
  }

  if (raw_socket_ != -1) {
    shutdown(raw_socket_, SHUT_RDWR);
    ::close(raw_socket_);
    raw_socket_ = -1;
  }

  is_initialized_.store(false);
  interface_index_ = -1;
  interface_name_.clear();
}

bool BasicInjector::isInitialized() const {
  return is_initialized_.load();
}

bool BasicInjector::createRawSocket() {
  raw_socket_ = socket(AF_PACKET, SOCK_RAW, htons(ETH_P_ALL));

  if (raw_socket_ < 0) {
    std::cerr << "BasicInjector: Error creating raw socket: " << strerror(errno) << std::endl;
    std::cerr << "Note: Raw sockets require root privileges" << std::endl;
    return false;
  }

  return true;
}

int BasicInjector::getInterfaceIndex() {
  struct ifreq ifr;
  memset(&ifr, 0, sizeof(ifr));
  strncpy(ifr.ifr_name, interface_name_.c_str(), IFNAMSIZ - 1);

  if (ioctl(raw_socket_, SIOCGIFINDEX, &ifr) < 0) {
    std::cerr << "BasicInjector: Error getting interface index for " << interface_name_ << ": " << strerror(errno)
              << std::endl;
    return -1;
  }

  return ifr.ifr_ifindex;
}

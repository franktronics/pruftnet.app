#include "packet_capture.hpp"
#include <arpa/inet.h>
#include <chrono>
#include <cstring>
#include <errno.h>
#include <fcntl.h>
#include <iostream>
#include <net/if.h>
#include <sys/ioctl.h>
#include <thread>
#include <unistd.h>

PacketCapture::PacketCapture(const std::string& interface_name)
    : interface_name_(interface_name), raw_socket_(-1), is_capturing_(false) {}

PacketCapture::~PacketCapture() {
  stopCapture();
}

bool PacketCapture::initialize() {
  if (!createRawSocket()) {
    return false;
  }

  if (!bindToInterface()) {
    close(raw_socket_);
    raw_socket_ = -1;
    return false;
  }

  return true;
}

bool PacketCapture::startCapture(const PacketHandler& handler) {
  if (raw_socket_ == -1 || is_capturing_.load()) {
    return false;
  }

  is_capturing_.store(true);

  uint8_t buffer[MAX_PACKET_SIZE];
  ssize_t packet_size;

  while (is_capturing_.load()) {
    packet_size = recv(raw_socket_, buffer, sizeof(buffer), 0);

    if (packet_size < 0) {
      if (errno == EAGAIN || errno == EWOULDBLOCK) {
        std::this_thread::sleep_for(std::chrono::microseconds(100));
        continue;
      }
      if (errno == EBADF || errno == ENOTSOCK) {
        break;
      }
      std::cerr << "Error receiving packet: " << strerror(errno) << std::endl;
      break;
    }

    if (packet_size > 0 && handler) {
      handler(buffer, static_cast<size_t>(packet_size));
    }
  }

  is_capturing_.store(false);
  return true;
}

void PacketCapture::stopCapture() {
  is_capturing_.store(false);

  if (raw_socket_ != -1) {
    shutdown(raw_socket_, SHUT_RDWR);
    close(raw_socket_);
    raw_socket_ = -1;
  }
}

bool PacketCapture::isCapturing() const {
  return is_capturing_.load();
}

bool PacketCapture::createRawSocket() {
  raw_socket_ = socket(AF_PACKET, SOCK_RAW, htons(ETH_P_ALL));

  if (raw_socket_ < 0) {
    std::cerr << "Error creating raw socket: " << strerror(errno) << std::endl;
    std::cerr << "Note: Raw sockets require root privileges" << std::endl;
    return false;
  }

  int flags = fcntl(raw_socket_, F_GETFL, 0);
  if (flags == -1 || fcntl(raw_socket_, F_SETFL, flags | O_NONBLOCK) == -1) {
    std::cerr << "Warning: Could not set socket to non-blocking mode" << std::endl;
  }

  return true;
}

int PacketCapture::getInterfaceIndex() {
  struct ifreq ifr;
  memset(&ifr, 0, sizeof(ifr));
  strncpy(ifr.ifr_name, interface_name_.c_str(), IFNAMSIZ - 1);

  if (ioctl(raw_socket_, SIOCGIFINDEX, &ifr) < 0) {
    std::cerr << "Error getting interface index for " << interface_name_ << ": " << strerror(errno) << std::endl;
    return -1;
  }

  return ifr.ifr_ifindex;
}

bool PacketCapture::bindToInterface() {
  int interface_index = getInterfaceIndex();
  if (interface_index < 0) {
    return false;
  }

  struct sockaddr_ll socket_address;
  memset(&socket_address, 0, sizeof(socket_address));
  socket_address.sll_family = AF_PACKET;
  socket_address.sll_protocol = htons(ETH_P_ALL);
  socket_address.sll_ifindex = interface_index;

  if (bind(raw_socket_, reinterpret_cast<struct sockaddr*>(&socket_address), sizeof(socket_address)) < 0) {
    std::cerr << "Error binding to interface " << interface_name_ << ": " << strerror(errno) << std::endl;
    return false;
  }

  return true;
}
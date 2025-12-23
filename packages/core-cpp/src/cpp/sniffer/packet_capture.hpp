#pragma once

#include "../utils/packets/packet_model.hpp"
#include <atomic>
#include <functional>
#include <linux/if_packet.h>
#include <net/ethernet.h>
#include <string>
#include <sys/socket.h>

using PacketHandler = std::function<void(const uint8_t* packet_data, size_t length)>;

class PacketCapture {
public:
  explicit PacketCapture(const std::string& interface_name);
  ~PacketCapture();

  bool initialize();
  bool startCapture(const PacketHandler& handler);
  void stopCapture();
  bool isCapturing() const;

private:
  std::string interface_name_;
  int raw_socket_;
  std::atomic<bool> is_capturing_;

  bool createRawSocket();
  int getInterfaceIndex();
  bool bindToInterface();
};

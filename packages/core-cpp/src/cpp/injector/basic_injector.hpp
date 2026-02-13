#pragma once

#include <atomic>
#include <linux/if_packet.h>
#include <net/ethernet.h>
#include <string>
#include <sys/socket.h>

class BasicInjector {
public:
  BasicInjector();
  ~BasicInjector();

  bool initialize(const std::string& interface_name);
  bool send(const uint8_t* packet_data, size_t length);
  void close();
  bool isInitialized() const;

private:
  std::string interface_name_;
  int raw_socket_;
  int interface_index_;
  std::atomic<bool> is_initialized_;

  bool createRawSocket();
  int getInterfaceIndex();
};

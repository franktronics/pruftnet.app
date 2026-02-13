#pragma once

#include <atomic>
#include <string>
#include <sys/socket.h>

class IcmpInjector {
public:
  IcmpInjector();
  ~IcmpInjector();

  bool initialize(const std::string& interface_name = "");
  bool send(const std::string& target_ip, const uint8_t* icmp_data, size_t length);
  void close();
  bool isInitialized() const;

private:
  std::string interface_name_;
  int raw_socket_;
  std::atomic<bool> is_initialized_;

  bool createRawSocket();
  bool bindToInterface();
};

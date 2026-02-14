#pragma once

#include <atomic>
#include <string>
#include <sys/socket.h>

class Ipv6RsInjector {
public:
  Ipv6RsInjector();
  ~Ipv6RsInjector();

  bool initialize(const std::string& interface_name);
  bool send();
  void close();
  bool isInitialized() const;

private:
  std::string interface_name_;
  int raw_socket_;
  std::atomic<bool> is_initialized_;
  unsigned int if_index_;
  std::string source_mac_;

  bool createRawSocket();
  bool bindToInterface();
  bool retrieveInterfaceInfo();
  std::string getMacAddress() const;
};

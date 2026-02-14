#pragma once

#include <atomic>
#include <string>
#include <sys/socket.h>

class Ipv6NsInjector {
public:
  Ipv6NsInjector();
  ~Ipv6NsInjector();

  bool initialize(const std::string& interface_name);
  bool send(const std::string& target_ipv6, const uint8_t* icmpv6_data, size_t length);
  void close();
  bool isInitialized() const;

private:
  std::string interface_name_;
  int raw_socket_;
  std::atomic<bool> is_initialized_;
  unsigned int if_index_;

  bool createRawSocket();
  bool bindToInterface();
  bool isLinkLocal(const std::string& ipv6) const;
  bool isMulticast(const std::string& ipv6) const;
};

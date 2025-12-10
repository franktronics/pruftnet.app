#pragma once

#include "../analyser_mode.hpp"
#include "../../../utils/common/common.hpp"
#include <array>
#include <atomic>
#include <string>
#include <thread>

class NeighborDiscovery : public Analysis {
public:
  NeighborDiscovery();
  virtual ~NeighborDiscovery();

  void setSourceIPv6(const std::string &source_ipv6);
  void setSourceMAC(const std::array<uint8_t, 6> &source_mac);
  void stop();
  bool isRunning() const;

protected:
  std::string source_ipv6_;
  std::array<uint8_t, 6> source_mac_;
  int raw_socket_;
  std::atomic<bool> is_running_;
  std::atomic<bool> should_stop_;
  std::thread send_thread_;

  bool createRawSocket();
  int getInterfaceIndex(const std::string &interface_name);
  bool sendPacket(const uint8_t *packet, size_t length,
                  const std::string &interface_name);
  std::array<uint8_t, 16> parseIPv6Address(const std::string &ipv6_str);
  uint16_t calculateICMPv6Checksum(
      const std::array<uint8_t, MAX_PACKET_SIZE> &packet, size_t ipv6_offset,
      size_t icmpv6_offset, size_t icmpv6_length);
};

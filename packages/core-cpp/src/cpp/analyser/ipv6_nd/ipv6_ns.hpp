#pragma once

#include "../../../utils/common/common.hpp"
#include "neighbor_discovery.hpp"
#include <array>
#include <string>

class IPv6NeighborSolicitation : public NeighborDiscovery {
public:
  IPv6NeighborSolicitation();
  ~IPv6NeighborSolicitation();

  void setTargetIPv6(const std::string& target_ipv6);
  bool analyze(std::string& interface_name) override;

private:
  std::string target_ipv6_;

  void sendWorker(const std::string& interface_name);
  std::array<uint8_t, MAX_PACKET_SIZE> buildNSPacket();
  std::array<uint8_t, 6> calculateSolicitedNodeMAC(const std::string& target_ipv6);
};

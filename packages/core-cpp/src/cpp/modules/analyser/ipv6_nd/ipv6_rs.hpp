#pragma once

#include "neighbor_discovery.hpp"
#include "../../../utils/common/common.hpp"
#include <array>
#include <string>

class IPv6RouterSolicitation : public NeighborDiscovery {
public:
  IPv6RouterSolicitation();
  ~IPv6RouterSolicitation();

  bool analyze(std::string &interface_name) override;

private:
  void sendWorker(const std::string &interface_name);
  std::array<uint8_t, MAX_PACKET_SIZE> buildRSPacket();
};

#pragma once

#include "../../utils/packets/packet_model.hpp"
#include "../../utils/packets/packet_processing_model.hpp"

class PacketProcessing : public ProcessingModel {
private:
  std::string iface_name;

public:
  PacketProcessing();
  ~PacketProcessing();

  void execute(const RawPacket &packet) override;
};

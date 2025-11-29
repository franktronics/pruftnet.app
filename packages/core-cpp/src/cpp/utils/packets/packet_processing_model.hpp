#pragma once

#include "./packet_model.hpp"

struct ProcessingModel {
  virtual ~ProcessingModel() = default;
  virtual void execute(const RawPacket &packet) = 0;
};

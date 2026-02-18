#pragma once

#include "../packets/packet_model.hpp"
#include "pcap_format.hpp"
#include <fstream>
#include <memory>
#include <string>

class PcapBuilder {
public:
  explicit PcapBuilder(const std::string& filename);
  ~PcapBuilder();

  // Initialize and open the PCAP file for writing
  bool open();

  // Write a single packet to the PCAP file
  bool writePacket(const RawPacket& packet);

  // Close the PCAP file
  void close();

  // Check if the file is currently open
  bool isOpen() const;

private:
  std::string filename_;
  std::unique_ptr<std::ofstream> file_;
  bool is_open_;

  // Write the global PCAP header
  bool writeGlobalHeader();

  // Convert timestamp to PCAP format
  PcapPacketHeader createPacketHeader(const RawPacket& packet);
};

#include "pcap_builder.hpp"
#include <chrono>
#include <iostream>

PcapBuilder::PcapBuilder(const std::string& filename) : filename_(filename), file_(nullptr), is_open_(false) {}

PcapBuilder::~PcapBuilder() {
  if (is_open_) {
    close();
  }
}

bool PcapBuilder::open() {
  if (is_open_) {
    return false; // Already open
  }

  file_ = std::make_unique<std::ofstream>(filename_, std::ios::binary);
  if (!file_->is_open()) {
    return false;
  }

  if (!writeGlobalHeader()) {
    file_->close();
    return false;
  }

  is_open_ = true;
  return true;
}

bool PcapBuilder::writePacket(const RawPacket& packet) {
  if (!is_open_ || !packet.valid || packet.length == 0) {
    return false;
  }

  // Create packet header
  PcapPacketHeader header = createPacketHeader(packet);

  // Write packet header
  file_->write(reinterpret_cast<const char*>(&header), sizeof(PcapPacketHeader));
  if (file_->fail()) {
    return false;
  }

  // Write packet data
  file_->write(reinterpret_cast<const char*>(packet.data.data()), packet.length);
  if (file_->fail()) {
    return false;
  }

  // Flush to ensure data is written
  file_->flush();
  return true;
}

void PcapBuilder::close() {
  if (is_open_ && file_) {
    file_->close();
    is_open_ = false;
  }
}

bool PcapBuilder::isOpen() const {
  return is_open_;
}

bool PcapBuilder::writeGlobalHeader() {
  PcapGlobalHeader header;
  file_->write(reinterpret_cast<const char*>(&header), sizeof(PcapGlobalHeader));
  return !file_->fail();
}

PcapPacketHeader PcapBuilder::createPacketHeader(const RawPacket& packet) {
  PcapPacketHeader header;

  // Convert timestamp to seconds and microseconds
  auto time_since_epoch = packet.timestamp.time_since_epoch();
  auto seconds = std::chrono::duration_cast<std::chrono::seconds>(time_since_epoch);
  auto microseconds = std::chrono::duration_cast<std::chrono::microseconds>(time_since_epoch - seconds);

  header.timestamp_seconds = static_cast<uint32_t>(seconds.count());
  header.timestamp_microseconds = static_cast<uint32_t>(microseconds.count());
  header.captured_length = static_cast<uint32_t>(packet.length);

  return header;
}

#pragma once

#include <cstdint>

// PCAP file format structures
// Reference: https://wiki.wireshark.org/Development/LibpcapFileFormat

struct PcapGlobalHeader {
  uint32_t magic_number = 0xa1b2c3d4;  // Magic number for PCAP files
  uint16_t version_major = 2;          // Major version number
  uint16_t version_minor = 4;          // Minor version number
  int32_t timezone_offset = 0;         // GMT to local correction
  uint32_t timestamp_accuracy = 0;     // Accuracy of timestamps
  uint32_t max_capture_length = 65535; // Maximum length of captured packets
  uint32_t data_link_type = 1;         // Data link type (1 = Ethernet)
};

struct PcapPacketHeader {
  uint32_t timestamp_seconds;      // Timestamp seconds since epoch
  uint32_t timestamp_microseconds; // Timestamp microseconds
  uint32_t captured_length;        // Number of bytes captured
};
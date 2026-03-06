#pragma once

#include <cstddef>

// Network packet capture constants
constexpr size_t MAX_PACKET_SIZE = 9000; // Maximum packet size (supports jumbo frames)
constexpr size_t RING_SIZE = 128;        // Ring buffer size for packet queue

// PCAP file format constants
constexpr size_t PCAP_GLOBAL_HEADER_SIZE = 24; // Size of PCAP global header
constexpr size_t PCAP_PACKET_HEADER_SIZE = 16; // Size of PCAP packet header per packet
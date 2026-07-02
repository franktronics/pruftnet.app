#include <algorithm>
#include <atomic>
#include <chrono>
#include <cstddef>
#include <cstdint>
#include <iomanip>
#include <iostream>
#include <string>
#include <string_view>
#include <thread>

#include "pruftnet/sniffing/network_sniffer.hpp"

namespace {

constexpr std::string_view kInterfaceName = "en16";
constexpr bool kPromiscuous = false;
constexpr std::uint64_t kPacketsToCapture = 10;
constexpr std::size_t kBytesToPrint = 32;

std::string_view parse_status_name(pruftnet::sniffing::ParseStatus status) {
  switch (status) {
  case pruftnet::sniffing::ParseStatus::NotParsed:
    return "NotParsed";
  case pruftnet::sniffing::ParseStatus::Parsed:
    return "Parsed";
  case pruftnet::sniffing::ParseStatus::Unsupported:
    return "Unsupported";
  case pruftnet::sniffing::ParseStatus::Error:
    return "Error";
  }
  return "Unknown";
}

void print_first_bytes(std::span<const std::byte> bytes) {
  const auto bytes_to_print = std::min(bytes.size(), kBytesToPrint);
  const auto old_flags = std::cout.flags();
  const auto old_fill = std::cout.fill();

  for (std::size_t index = 0; index < bytes_to_print; ++index) {
    std::cout << std::setw(2) << std::setfill('0') << std::hex
              << static_cast<unsigned int>(
                     std::to_integer<unsigned char>(bytes[index]))
              << ' ';
  }

  std::cout.flags(old_flags);
  std::cout.fill(old_fill);
}

void print_stats(const pruftnet::sniffing::SnifferStatsSnapshot &stats) {
  std::cout << "stats seen=" << stats.packets_seen
            << " enqueued=" << stats.packets_enqueued
            << " parsed=" << stats.packets_parsed
            << " app_drops=" << stats.app_ring_drops
            << " pcap_recv=" << stats.pcap_recv
            << " pcap_drop=" << stats.pcap_drop << " ring=" << stats.ring_depth
            << '/' << stats.ring_capacity << '\n';
}

} // namespace

int main() {
  using namespace pruftnet::sniffing;

  if (kInterfaceName == "CHANGE_ME") {
    std::cerr << "Edit kInterfaceName in examples/sniffing_smoke_test.cpp "
                 "before running.\n";
    return 2;
  }

  SnifferOptions options;
  options.interface_name = std::string(kInterfaceName);
  options.promiscuous = kPromiscuous;

  std::atomic<std::uint64_t> printed_packets{0};

  NetworkSniffer sniffer(
      options,
      [&](const RawPacketView &raw, const ParsedPacket &parsed,
          const SnifferStatsSnapshot &stats) {
        const auto count =
            printed_packets.fetch_add(1, std::memory_order_relaxed) + 1;

        std::cout << "packet #" << raw.metadata.sequence
                  << " ts=" << raw.metadata.timestamp_ns
                  << " caplen=" << raw.metadata.captured_len
                  << " wirelen=" << raw.metadata.wire_len
                  << " parsed=" << parse_status_name(parsed.status)
                  << " bytes=";
        print_first_bytes(raw.bytes);
        std::cout << '\n';

        if (count == kPacketsToCapture) {
          print_stats(stats);
        }
      },
      [](const SnifferEvent &event) {
        std::cerr << '[' << to_string(event.severity) << "] "
                  << to_string(event.code) << ": " << event.message;
        if (!event.pcap_error.empty()) {
          std::cerr << " pcap=\"" << event.pcap_error << '"';
        }
        std::cerr << '\n';
      });

  if (auto error = sniffer.start()) {
    std::cerr << '[' << to_string(error->severity) << "] "
              << to_string(error->code) << ": " << error->message;
    if (!error->pcap_error.empty()) {
      std::cerr << " pcap=\"" << error->pcap_error << '"';
    }
    std::cerr << '\n';
    return 1;
  }

  while (printed_packets.load(std::memory_order_relaxed) < kPacketsToCapture &&
         sniffer.is_running()) {
    std::this_thread::sleep_for(std::chrono::milliseconds(50));
  }

  sniffer.stop();
  print_stats(sniffer.stats());
  return 0;
}

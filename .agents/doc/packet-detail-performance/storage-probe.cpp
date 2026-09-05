#include "capture/packet_index.hpp"
#include <algorithm>
#include <chrono>
#include <fstream>
#include <iostream>

namespace pruftnet::capture::legacy {
std::variant<PcapngSpool::RecoveryResult, SpoolError>
recover_segment(const std::filesystem::path &, bool);
}
using namespace pruftnet;
using Clock = std::chrono::steady_clock;

int main(int argc, char **argv) {
  if (argc != 2)
    return 1;
  const auto temporary =
      std::filesystem::temp_directory_path() /
      ("pruftnet-detail-probe-" +
       std::to_string(Clock::now().time_since_epoch().count()));
  std::filesystem::create_directory(temporary);
  const auto source = temporary / "capture.pcapng";
  std::filesystem::copy_file(argv[1], source);
  const auto recovery = capture::PcapngSpool::recover_segment(source, false);
  const auto &initial =
      std::get<capture::PcapngSpool::RecoveryResult>(recovery);
  if (initial.packets.empty())
    return 2;
  std::cout << "packets=" << initial.packets.size()
            << " bytes=" << initial.valid_bytes << '\n';
  const auto timed = [&](const char *label, auto read, int trials) {
    std::vector<double> samples;
    for (int i = 0; i < trials; ++i) {
      const auto start = Clock::now();
      read();
      samples.push_back(
          std::chrono::duration<double, std::milli>(Clock::now() - start)
              .count());
    }
    std::sort(samples.begin(), samples.end());
    std::cout << label << " trials=" << trials
              << " median_ms=" << samples[trials / 2]
              << " max_ms=" << samples.back() << '\n';
  };
  const auto key = initial.packets.back().metadata.key;
  timed(
      "legacy_last",
      [&] {
        const auto recovered =
            capture::PcapngSpool::recover_segment(source, false);
        const auto &packets =
            std::get<capture::PcapngSpool::RecoveryResult>(recovered).packets;
        const auto packet = std::find_if(packets.begin(), packets.end(),
                                         [&](const auto &candidate) {
                                           return candidate.metadata.key == key;
                                         });
        if (packet == packets.end())
          std::abort();
        std::vector<char> bytes(packet->metadata.captured_len);
        std::ifstream input(source, std::ios::binary);
        input.seekg(packet->data_offset);
        input.read(bytes.data(), bytes.size());
        if (!input)
          std::abort();
      },
      5);
  timed(
      "first_rebuild",
      [&] {
        const auto result = capture::internal::read_indexed_packet(source, key);
        if (!std::get<capture::PacketSpoolLookup>(result).packet)
          std::abort();
      },
      1);
  for (const auto ordinal : {std::size_t(0), initial.packets.size() / 2,
                             initial.packets.size() - 1}) {
    std::cout << "ordinal=" << ordinal << ' ';
    timed(
        "indexed",
        [&] {
          const auto result = capture::internal::read_indexed_packet(
              source, initial.packets[ordinal].metadata.key);
          if (!std::get<capture::PacketSpoolLookup>(result).packet)
            std::abort();
        },
        20);
  }
  timed("write_committed_index", [&] {
    capture::internal::PacketIndexWriter writer(source, initial.capture_id);
    for (const auto &packet : initial.packets) writer.append(packet);
    if (!writer.finish()) std::abort();
  }, 5);
  std::cout << "index_bytes="
            << std::filesystem::file_size(
                   capture::internal::packet_index_path(source))
            << '\n';
  std::filesystem::remove_all(temporary);
}

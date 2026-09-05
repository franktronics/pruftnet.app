#include <cassert>
#include <fstream>
#include <thread>

#include "capture/packet_index.hpp"
#include "capture/pcapng_format.hpp"

using namespace pruftnet;
using namespace pruftnet::capture;
using namespace pruftnet::capture::internal;

int main() {
  const auto directory =
      std::filesystem::temp_directory_path() /
      ("pruftnet-index-test-" +
       std::to_string(
           std::chrono::steady_clock::now().time_since_epoch().count()));
  std::filesystem::create_directories(directory);
  const sniffing::CaptureId id{1, 2};
  PcapngSpoolOptions options;
  options.directory = directory;
  options.temporary = false;
  auto created = PcapngSpool::create(
      options, id,
      {{7, "test", 1, 65535, 9}, {9, "microseconds", 101, 65535, 6}});
  assert(std::holds_alternative<std::unique_ptr<PcapngSpool>>(created));
  auto spool = std::move(std::get<std::unique_ptr<PcapngSpool>>(created));
  const std::vector<std::byte> bytes(60, std::byte{0x42});
  // Reverse IDs across several sorted runs, with gaps, as multi-interface
  // arrival and dropped packets need not preserve dense packet-ID order.
  for (std::uint64_t i = 10000; i > 0; --i) {
    sniffing::PacketMetadata metadata;
    metadata.key = {id, i * 2};
    metadata.interface_id = i % 2 == 0 ? 7 : 9;
    metadata.link_type = i % 2 == 0 ? 1 : 101;
    metadata.timestamp_ns = i * 1000;
    metadata.captured_len = bytes.size();
    metadata.wire_len = 100;
    assert(!spool->append(metadata, bytes));
  }
  assert(!std::holds_alternative<SpoolError>(spool->finalize()));
  const auto source = spool->segment_paths().front();
  const auto index = packet_index_path(source);
  auto read = [&](std::uint64_t packet_id) {
    auto result = read_indexed_packet(source, {id, packet_id});
    assert(std::holds_alternative<PacketSpoolLookup>(result));
    return std::get<PacketSpoolLookup>(std::move(result));
  };
  auto verify = [&](std::uint64_t packet_id) {
    const auto packet = read(packet_id);
    assert(packet.packet);
    assert(packet.packet->metadata.key.packet_id == packet_id);
    assert(packet.packet->metadata.timestamp_ns == packet_id * 500);
    assert(packet.packet->metadata.interface_id ==
           (packet_id % 4 == 0 ? 7 : 9));
    assert(packet.packet->metadata.link_type == (packet_id % 4 == 0 ? 1 : 101));
    assert(packet.packet->metadata.wire_len == 100);
    assert(packet.packet->bytes == bytes);
  };
  verify(2); // Legacy capture: streaming reconstruction and atomic publication.
  assert(std::filesystem::exists(index));
  assert(std::filesystem::file_size(index) < 170000);
  const auto index_time = std::filesystem::last_write_time(index);
  verify(10000);
  verify(20000);
  assert(read(1).status == PacketSpoolLookupStatus::NotFound);
  assert(std::filesystem::last_write_time(index) == index_time);

  // New captures can publish from committed metadata without rereading raw
  // data.
  std::filesystem::remove(index);
  {
    PacketIndexWriter writer(source, id);
    for (std::uint64_t ordinal = 0; ordinal < spool->committed_count();
         ++ordinal)
      writer.append(*spool->committed_packet(ordinal));
    assert(writer.finish());
  }
  verify(8192);

  // A burst may exceed the background queue. It must publish a complete
  // index or leave reconstruction to the reader, never publish a partial one.
  std::filesystem::remove(index);
  {
    AsyncPacketIndexWriter writer;
    writer.segment(source, id);
    for (std::uint64_t ordinal = 0; ordinal < spool->committed_count();
         ++ordinal)
      writer.append(*spool->committed_packet(ordinal));
    writer.finish();
  }
  verify(20000);
  verify(11808);
  verify(3616);
  verify(2);

  // A damaged index header, run header, record or truncated file is disposable.
  for (const auto position : {0, 64, 112}) {
    {
      std::fstream output(index,
                          std::ios::binary | std::ios::in | std::ios::out);
      output.seekp(position);
      output.put('\xff');
    }
    verify(20000);
  }
  std::filesystem::resize_file(index, 100);
  verify(2);
  std::filesystem::last_write_time(source,
                                   std::filesystem::last_write_time(source) +
                                       std::chrono::seconds(1));
  verify(10000);

  std::stop_source stop;
  stop.request_stop();
  const auto cancelled = read_indexed_packet(source, {id, 2}, stop.get_token());
  assert(std::get<SpoolError>(cancelled).reason ==
         SpoolFailureReason::ReadCancelled);
  // Cancellation is checked between blocks even during reconstruction.
  std::filesystem::remove(index);
  std::stop_source during;
  {
    PacketIndexWriter writer(source, id);
    const auto scanned = scan_segment(
        source, false,
        [&](const auto &packet, auto) {
          writer.append(packet);
          during.request_stop();
        },
        during.get_token());
    assert(std::get<SpoolError>(scanned).reason ==
           SpoolFailureReason::ReadCancelled);
  }
  assert(!std::filesystem::exists(index));
  for (const auto &entry : std::filesystem::directory_iterator(directory))
    assert(entry.path().extension() == ".pcapng");
  verify(20000);

  // Index publication failures do not make readable raw packets unavailable.
  std::filesystem::remove(index);
  std::filesystem::create_directory(index);
  verify(2);
  assert(std::filesystem::is_directory(index));
  std::filesystem::remove(index);
  verify(20000);

  // Wrong capture identity and corrupt selected raw blocks never return bytes.
  const auto wrong = read_indexed_packet(source, {{3, 4}, 2});
  assert(std::holds_alternative<SpoolError>(wrong));
  {
    const auto stamp = std::filesystem::last_write_time(source);
    const auto offset = spool->committed_packet(0)->block_offset;
    std::fstream output(source,
                        std::ios::binary | std::ios::in | std::ios::out);
    output.seekp(static_cast<std::streamoff>(offset + 4));
    output.put('\x01');
    output.close();
    std::filesystem::last_write_time(source, stamp);
    const auto corrupt = read_indexed_packet(source, {id, 20000});
    assert(std::holds_alternative<SpoolError>(corrupt));
  }

  spool.reset();
  std::filesystem::remove_all(directory);
}

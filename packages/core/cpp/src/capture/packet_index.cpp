#include "capture/packet_index.hpp"
#include "capture/pcapng_format.hpp"

#include <algorithm>
#include <array>
#include <atomic>
#include <chrono>
#include <condition_variable>
#include <deque>
#include <fstream>
#include <mutex>
#include <random>
#include <thread>

namespace pruftnet::capture::internal {
namespace {
constexpr std::uint64_t kMagic = 0x3158444954505250ULL; // PRPTIDX1
constexpr std::size_t kRunPackets = 4096;
using Entry = std::array<std::uint64_t, 2>;

std::uint64_t hash(std::span<const std::uint64_t> words) {
  std::uint64_t value = 14695981039346656037ULL;
  for (auto word : words)
    for (unsigned i = 0; i < 8; ++i) {
      value = (value ^ (word & 255)) * 1099511628211ULL;
      word >>= 8;
    }
  return value;
}

void write_words(std::ostream &out, std::span<const std::uint64_t> words) {
  // Explicit little endian encoding, independent of host alignment and ABI.
  std::vector<char> bytes(words.size() * 8);
  for (std::size_t i = 0; i < words.size(); ++i)
    for (unsigned b = 0; b < 8; ++b)
      bytes[i * 8 + b] = static_cast<char>(words[i] >> (b * 8));
  out.write(bytes.data(), static_cast<std::streamsize>(bytes.size()));
}

bool read_words(std::istream &in, std::span<std::uint64_t> words) {
  std::vector<unsigned char> bytes(words.size() * 8);
  if (!in.read(reinterpret_cast<char *>(bytes.data()), bytes.size()))
    return false;
  for (std::size_t i = 0; i < words.size(); ++i) {
    words[i] = 0;
    for (unsigned b = 0; b < 8; ++b)
      words[i] |= std::uint64_t(bytes[i * 8 + b]) << (b * 8);
  }
  return true;
}

struct Fingerprint {
  std::uint64_t size;
  std::uint64_t modified;
  bool operator==(const Fingerprint &) const = default;
};

std::optional<Fingerprint> fingerprint(const std::filesystem::path &path) {
  std::error_code error;
  const auto size = std::filesystem::file_size(path, error);
  if (error)
    return std::nullopt;
  const auto modified = std::filesystem::last_write_time(path, error);
  if (error)
    return std::nullopt;
  // Preserve native clock ticks. Converting the Windows file-clock epoch to
  // signed nanoseconds can overflow; an index moved across hosts can rebuild.
  return Fingerprint{
      size, static_cast<std::uint64_t>(modified.time_since_epoch().count())};
}

struct IndexLookup {
  bool valid = false;
  std::optional<std::uint64_t> offset;
};

IndexLookup find_offset(const std::filesystem::path &source,
                        const sniffing::PacketKey &key, Fingerprint stamp,
                        std::stop_token stop) {
  std::ifstream input(packet_index_path(source), std::ios::binary);
  std::array<std::uint64_t, 8> header{};
  if (!read_words(input, header) || header[0] != kMagic ||
      header[1] != key.capture_id.high || header[2] != key.capture_id.low ||
      header[3] != stamp.size || header[4] != stamp.modified ||
      header[7] != hash(std::span(header).first(7)))
    return {};
  input.seekg(0, std::ios::end);
  const auto length = input.tellg();
  if (length < 64 || header[6] != static_cast<std::uint64_t>(length) ||
      header[5] > (header[6] - 64) / 64)
    return {};
  input.seekg(64);
  std::optional<std::uint64_t> found;
  for (std::uint64_t run = 0; run < header[5]; ++run) {
    if (stop.stop_requested())
      return {};
    std::array<std::uint64_t, 6> chunk{};
    if (!read_words(input, chunk) || chunk[2] == 0 || chunk[2] > kRunPackets ||
        chunk[0] > chunk[1] || chunk[4] != run ||
        chunk[5] != hash(std::span(chunk).first(5)))
      return {};
    if (key.packet_id < chunk[0] || key.packet_id > chunk[1]) {
      input.seekg(static_cast<std::streamoff>(chunk[2] * 16), std::ios::cur);
      continue;
    }
    std::vector<std::uint64_t> words(chunk[2] * 2);
    if (!read_words(input, words) || hash(words) != chunk[3])
      return {};
    std::size_t lo = 0, hi = chunk[2];
    while (lo < hi) {
      const auto mid = lo + (hi - lo) / 2;
      if (words[mid * 2] < key.packet_id)
        lo = mid + 1;
      else
        hi = mid;
    }
    if (lo < chunk[2] && words[lo * 2] == key.packet_id) {
      if (found)
        return {};
      found = words[lo * 2 + 1];
    }
  }
  if (!input || input.tellg() != length)
    return {};
  return {true, found};
}

SpoolError cancelled() {
  return {SpoolFailureReason::ReadCancelled, "Packet read was cancelled.", 0};
}
} // namespace

std::filesystem::path packet_index_path(const std::filesystem::path &source) {
  auto path = source;
  path += ".pidx";
  return path;
}

struct PacketIndexWriter::Impl {
  std::filesystem::path source, temporary_directory;
  sniffing::CaptureId capture_id;
  std::ofstream output;
  std::vector<Entry> entries;
  std::uint64_t runs = 0, last_end = 0;
  bool finished = false;

  Impl(const std::filesystem::path &path, sniffing::CaptureId id)
      : source(path), capture_id(id) {
    std::random_device random;
    for (int attempt = 0; attempt < 4; ++attempt) {
      temporary_directory = packet_index_path(source);
      temporary_directory +=
          ".tmp-" + std::to_string(random()) + "-" + std::to_string(random());
      std::error_code error;
      if (std::filesystem::create_directory(temporary_directory, error)) {
        output.open(temporary_directory / "index", std::ios::binary);
        const std::array<std::uint64_t, 8> empty{};
        write_words(output, empty);
        entries.reserve(kRunPackets);
        return;
      }
    }
    temporary_directory.clear();
  }

  ~Impl() {
    output.close();
    if (!temporary_directory.empty()) {
      std::error_code error;
      std::filesystem::remove_all(temporary_directory, error);
    }
  }

  void flush() {
    if (entries.empty())
      return;
    if (!std::is_sorted(entries.begin(), entries.end()))
      std::sort(entries.begin(), entries.end());
    std::vector<std::uint64_t> words;
    words.reserve(entries.size() * 2);
    for (const auto &entry : entries) {
      words.push_back(entry[0]);
      words.push_back(entry[1]);
    }
    std::array<std::uint64_t, 6> chunk{entries.front()[0],
                                       entries.back()[0],
                                       entries.size(),
                                       hash(words),
                                       runs++,
                                       0};
    chunk[5] = hash(std::span(chunk).first(5));
    write_words(output, chunk);
    write_words(output, words);
    entries.clear();
  }
};

PacketIndexWriter::PacketIndexWriter(const std::filesystem::path &source,
                                     sniffing::CaptureId capture_id) noexcept {
  try {
    impl_ = std::make_unique<Impl>(source, capture_id);
  } catch (...) {
  }
}
PacketIndexWriter::~PacketIndexWriter() = default;

void PacketIndexWriter::append(const CommittedPacket &packet) noexcept {
  if (!impl_ || !impl_->output || impl_->finished)
    return;
  try {
    if (packet.metadata.key.capture_id != impl_->capture_id ||
        (impl_->last_end != 0 && packet.block_offset != impl_->last_end)) {
      impl_.reset();
      return;
    }
    impl_->entries.push_back(
        {packet.metadata.key.packet_id, packet.block_offset});
    impl_->last_end = packet.block_offset + packet.block_length;
    if (impl_->entries.size() == kRunPackets)
      impl_->flush();
  } catch (...) {
    impl_.reset();
  }
}

bool PacketIndexWriter::finish() noexcept {
  if (!impl_ || !impl_->output || impl_->finished)
    return false;
  try {
    const auto stamp = fingerprint(impl_->source);
    if (!stamp || impl_->last_end != stamp->size)
      return false;
    impl_->flush();
    const auto length = impl_->output.tellp();
    if (length < 64)
      return false;
    std::array<std::uint64_t, 8> header{kMagic,
                                        impl_->capture_id.high,
                                        impl_->capture_id.low,
                                        stamp->size,
                                        stamp->modified,
                                        impl_->runs,
                                        static_cast<std::uint64_t>(length),
                                        0};
    header[7] = hash(std::span(header).first(7));
    impl_->output.seekp(0);
    write_words(impl_->output, header);
    impl_->output.close();
    if (impl_->output.fail() || fingerprint(impl_->source) != stamp)
      return false;
    const auto destination = packet_index_path(impl_->source);
    std::error_code error;
    std::filesystem::rename(impl_->temporary_directory / "index", destination,
                            error);
#ifdef _WIN32
    // Windows cannot replace an existing destination. Missing derived data is
    // safe: readers rebuild it, and raw capture files are never replaced.
    if (error) {
      std::filesystem::remove(destination, error);
      error.clear();
      std::filesystem::rename(impl_->temporary_directory / "index", destination,
                              error);
    }
#endif
    impl_->finished = !error;
    if (impl_->finished && fingerprint(impl_->source) != stamp) {
      // Ring eviction can race publication; do not leave an orphan sidecar.
      std::filesystem::remove(destination, error);
      impl_->finished = false;
    }
    return impl_->finished;
  } catch (...) {
    return false;
  }
}

struct AsyncPacketIndexWriter::Impl {
  struct Batch {
    std::filesystem::path source;
    sniffing::CaptureId capture_id;
    std::vector<CommittedPacket> packets;
  };
  std::mutex mutex;
  std::condition_variable ready;
  std::deque<Batch> queue;
  Batch current;
  std::atomic<bool> failed{false};
  bool closed = false;
  std::thread thread;

  Impl() : thread([this] { run(); }) {}
  ~Impl() {
    flush();
    {
      std::lock_guard lock(mutex);
      closed = true;
    }
    ready.notify_one();
    thread.join();
  }

  void flush() noexcept {
    if (current.packets.empty())
      return;
    try {
      std::unique_lock lock(mutex);
      if (queue.size() >= 2 || failed.load()) {
        // Never resume halfway through this segment: only a complete index
        // may be published, even if the queue recovers before the next batch.
        current.source.clear();
        current.packets.clear();
        return;
      }
      queue.push_back({current.source, current.capture_id, {}});
      queue.back().packets.swap(current.packets);
      lock.unlock();
      ready.notify_one();
    } catch (...) {
      current.source.clear();
      current.packets.clear();
    }
  }

  void run() noexcept {
    try {
      std::filesystem::path source;
      std::optional<PacketIndexWriter> writer;
      while (true) {
        Batch batch;
        {
          std::unique_lock lock(mutex);
          ready.wait(lock, [&] { return closed || !queue.empty(); });
          if (queue.empty())
            break;
          batch = std::move(queue.front());
          queue.pop_front();
        }
        if (source != batch.source) {
          if (writer)
            writer->finish();
          writer.reset();
          source = batch.source;
          writer.emplace(source, batch.capture_id);
        }
        for (const auto &packet : batch.packets)
          writer->append(packet);
      }
      if (writer)
        writer->finish();
    } catch (...) {
      failed.store(true);
    }
  }
};

AsyncPacketIndexWriter::AsyncPacketIndexWriter() noexcept {
  try {
    impl_ = std::make_unique<Impl>();
  } catch (...) {
  }
}
AsyncPacketIndexWriter::~AsyncPacketIndexWriter() = default;

void AsyncPacketIndexWriter::segment(
    std::optional<std::filesystem::path> source,
    sniffing::CaptureId capture_id) noexcept {
  if (!impl_)
    return;
  impl_->flush();
  impl_->current.source = source ? std::move(*source) : std::filesystem::path{};
  impl_->current.capture_id = capture_id;
}

void AsyncPacketIndexWriter::append(const CommittedPacket &packet) noexcept {
  if (!impl_ || impl_->current.source.empty() || impl_->failed.load())
    return;
  try {
    impl_->current.packets.push_back(packet);
    if (impl_->current.packets.size() == kRunPackets)
      impl_->flush();
  } catch (...) {
    impl_->current.source.clear();
    impl_->current.packets.clear();
  }
}

void AsyncPacketIndexWriter::finish() noexcept { impl_.reset(); }

std::variant<PacketSpoolLookup, SpoolError>
read_indexed_packet(const std::filesystem::path &source,
                    const sniffing::PacketKey &key, std::stop_token stop) {
  if (stop.stop_requested())
    return cancelled();
  const auto stamp = fingerprint(source);
  if (!stamp)
    return SpoolError{SpoolFailureReason::OpenFailed,
                      "Capture segment is unavailable.", 0};
  const auto index = find_offset(source, key, *stamp, stop);
  if (stop.stop_requested())
    return cancelled();
  PacketSpoolLookup lookup;
  const auto collect = [&](const CommittedPacket &packet,
                           std::span<const std::byte> bytes) {
    if (packet.metadata.key == key) {
      lookup.status = PacketSpoolLookupStatus::Found;
      lookup.packet =
          PersistedPacket{packet.metadata, {bytes.begin(), bytes.end()}};
    }
  };
  if (index.valid) {
    if (!index.offset)
      return lookup;
    const auto read = scan_segment(source, false, collect, stop, index.offset);
    if (stop.stop_requested())
      return cancelled();
    if (std::holds_alternative<PcapngSpool::RecoveryResult>(read) &&
        lookup.packet && fingerprint(source) == stamp)
      return lookup;
    // A bad locator is recoverable, but never return data for another key.
    lookup = {};
  }
  PacketIndexWriter writer(source, key.capture_id);
  const auto recovered = scan_segment(
      source, false,
      [&](const CommittedPacket &packet, std::span<const std::byte> bytes) {
        writer.append(packet);
        collect(packet, bytes);
      },
      stop);
  if (const auto *error = std::get_if<SpoolError>(&recovered))
    return *error;
  const auto &result = std::get<PcapngSpool::RecoveryResult>(recovered);
  if (result.capture_id != key.capture_id || result.truncated_bytes != 0 ||
      fingerprint(source) != stamp)
    return SpoolError{SpoolFailureReason::CorruptData,
                      "Capture segment is invalid or changed during reading.",
                      0};
  if (stop.stop_requested())
    return cancelled();
  writer.finish();
  return lookup;
}
} // namespace pruftnet::capture::internal

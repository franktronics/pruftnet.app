#include "pruftnet/capture/pcapng_spool.hpp"

#include "capture/pcapng_format.hpp"

#include <algorithm>
#include <cerrno>
#include <cstdio>
#include <fstream>
#include <iomanip>
#include <mutex>
#include <sstream>
#include <system_error>

namespace pruftnet::capture {
namespace {

class FileSpoolSink final : public SpoolSink {
public:
  explicit FileSpoolSink(const std::filesystem::path &path) {
#ifdef _WIN32
    file_ = _wfopen(path.c_str(), L"wb");
#else
    file_ = std::fopen(path.c_str(), "wb");
#endif
    if (file_)
      std::setvbuf(file_, nullptr, _IOFBF, 1024 * 1024);
    if (!file_)
      last_error_ = errno;
  }

  ~FileSpoolSink() override { close(); }
  [[nodiscard]] bool valid() const noexcept { return file_ != nullptr; }

  std::size_t write(std::span<const std::byte> bytes) noexcept override {
    if (!file_)
      return 0;
    const auto written = std::fwrite(bytes.data(), 1, bytes.size(), file_);
    if (written != bytes.size())
      last_error_ = errno != 0 ? errno : EIO;
    return written;
  }

  bool flush() noexcept override {
    if (!file_)
      return false;
    if (std::fflush(file_) == 0)
      return true;
    last_error_ = errno != 0 ? errno : EIO;
    return false;
  }

  bool close() noexcept override {
    if (!file_)
      return true;
    auto *closing = file_;
    file_ = nullptr;
    if (std::fclose(closing) == 0)
      return true;
    last_error_ = errno != 0 ? errno : EIO;
    return false;
  }

  [[nodiscard]] int last_error() const noexcept override { return last_error_; }

private:
  std::FILE *file_ = nullptr;
  int last_error_ = 0;
};

std::unique_ptr<SpoolSink> make_file_sink(const std::filesystem::path &path,
                                          SpoolError &error) {
  auto sink = std::make_unique<FileSpoolSink>(path);
  if (!sink->valid()) {
    error = {SpoolFailureReason::OpenFailed,
             "Unable to open pcapng spool segment: " + path.string(),
             sink->last_error()};
    return nullptr;
  }
  return sink;
}

} // namespace

struct PcapngSpool::IndexEntry {
  CommittedPacket packet;
  bool committed = false;
  bool evicted = false;
};

struct PcapngSpool::Segment {
  std::uint64_t id = 0;
  std::filesystem::path path;
  std::uint64_t bytes = 0;
  std::uint64_t packets = 0;
  std::uint64_t committed_bytes = 0;
  std::uint64_t committed_packets = 0;
  std::uint64_t first_packet_id = 0;
  std::uint64_t last_packet_id = 0;
  bool evicted = false;
  std::uint64_t lease_count = 0;
};

PcapngSpool::PcapngSpool(PcapngSpoolOptions options,
                         sniffing::CaptureId capture_id,
                         std::vector<SpoolInterface> interfaces,
                         SpoolSinkFactory sink_factory)
    : options_(std::move(options)), capture_id_(capture_id),
      interfaces_(std::move(interfaces)),
      sink_factory_(std::move(sink_factory)) {}

PcapngSpool::~PcapngSpool() {
  if (!finalized_)
    (void)finalize();
  if (!options_.temporary || !finalized_ || preserve_on_destroy_)
    return;
  for (const auto &segment : segments_) {
    std::error_code error;
    std::filesystem::remove(segment.path, error);
  }
}

std::variant<std::unique_ptr<PcapngSpool>, SpoolError>
PcapngSpool::create(PcapngSpoolOptions options, sniffing::CaptureId capture_id,
                    std::vector<SpoolInterface> interfaces,
                    SpoolSinkFactory sink_factory) {
  if (options.directory.empty()) {
    std::error_code error;
    options.directory =
        std::filesystem::temp_directory_path(error) / "pruftnet" / "captures";
    if (error)
      return SpoolError{SpoolFailureReason::DirectoryUnavailable,
                        "Unable to resolve the temporary capture directory.",
                        error.value()};
  }
  std::error_code error;
  std::filesystem::create_directories(options.directory, error);
  if (error)
    return SpoolError{SpoolFailureReason::DirectoryUnavailable,
                      "Unable to create pcapng spool directory: " +
                          options.directory.string(),
                      error.value()};
  if (interfaces.empty())
    return SpoolError{SpoolFailureReason::InvalidPacket,
                      "A pcapng spool requires at least one interface.", 0};
  if (std::any_of(interfaces.begin(), interfaces.end(),
                  [](const SpoolInterface &interface) {
                    return interface.timestamp_resolution != 6 &&
                           interface.timestamp_resolution != 9;
                  }))
    return SpoolError{
        SpoolFailureReason::InvalidPacket,
        "Pruftnet pcapng spools support microsecond or nanosecond timestamps.",
        0};
  if (!sink_factory)
    sink_factory = make_file_sink;
  auto spool = std::unique_ptr<PcapngSpool>(
      new PcapngSpool(std::move(options), capture_id, std::move(interfaces),
                      std::move(sink_factory)));
  if (auto open_error = spool->open_segment())
    return *open_error;
  return spool;
}

std::optional<SpoolError> PcapngSpool::open_segment() noexcept {
  try {
    if (options_.max_segments != 0) {
      const auto retained = std::count_if(
          segments_.begin(), segments_.end(),
          [](const Segment &segment) { return !segment.evicted; });
      if (static_cast<std::size_t>(retained) >= options_.max_segments &&
          !options_.ring_mode)
        return SpoolError{SpoolFailureReason::QuotaExceeded,
                          "The configured pcapng segment limit was reached.",
                          0};
    }
    const auto segment_id = next_segment_id_++;
    std::ostringstream filename;
    filename << options_.file_prefix << '-'
             << internal::capture_id_hex(capture_id_) << '-'
             << std::setfill('0') << std::setw(6) << segment_id << ".pcapng";
    Segment segment{segment_id, options_.directory / filename.str()};
    SpoolError error;
    sink_ = sink_factory_(segment.path, error);
    if (!sink_)
      return error;
    segments_.push_back(std::move(segment));
    current_offset_ = 0;

    auto shb = internal::encode_section_header(capture_id_);
    std::vector<std::vector<std::byte>> interface_blocks;
    interface_blocks.reserve(interfaces_.size());
    std::size_t header_bytes = shb.size();
    for (const auto &interface : interfaces_) {
      interface_blocks.push_back(
          internal::encode_interface_description(interface));
      header_bytes += interface_blocks.back().size();
    }
    if (auto retention_error = enforce_retention(header_bytes)) {
      (void)sink_->close();
      sink_.reset();
      std::error_code remove_error;
      std::filesystem::remove(segments_.back().path, remove_error);
      segments_.pop_back();
      return retention_error;
    }
    if (auto write_error = write_block(shb))
      return write_error;
    for (const auto &idb : interface_blocks) {
      if (auto write_error = write_block(idb))
        return write_error;
    }
    if (!sink_->flush()) {
      ++flush_failures_;
      return SpoolError{SpoolFailureReason::FlushFailed,
                        "Unable to flush pcapng segment headers.",
                        sink_->last_error()};
    }
    segments_.back().committed_bytes = current_offset_;
    last_flush_ = std::chrono::steady_clock::now();
    while (options_.ring_mode && options_.max_segments != 0 &&
           static_cast<std::size_t>(std::count_if(
               segments_.begin(), segments_.end(), [](const Segment &item) {
                 return !item.evicted;
               })) > options_.max_segments) {
      if (auto eviction_error = evict_oldest_segment())
        return eviction_error;
    }
    return std::nullopt;
  } catch (const std::exception &error) {
    return SpoolError{SpoolFailureReason::OpenFailed, error.what(), errno};
  }
}

std::optional<SpoolError>
PcapngSpool::write_block(std::span<const std::byte> block) noexcept {
  if (!sink_ || segments_.empty())
    return SpoolError{SpoolFailureReason::WriteFailed,
                      "No pcapng spool segment is open.", 0};
  const auto written = sink_->write(block);
  current_offset_ += written;
  bytes_written_ += written;
  bytes_retained_ += written;
  segments_.back().bytes += written;
  if (written == block.size())
    return std::nullopt;
  ++write_failures_;
  preserve_on_destroy_ = true;
  return SpoolError{SpoolFailureReason::ShortWrite,
                    "A short write left a recoverable partial pcapng tail.",
                    sink_->last_error()};
}

std::optional<SpoolError>
PcapngSpool::rotate_if_needed(std::size_t next_block_bytes) noexcept {
  if (options_.segment_bytes == 0 || segments_.empty() ||
      segments_.back().packets == 0 ||
      current_offset_ + next_block_bytes <= options_.segment_bytes)
    return std::nullopt;
  const auto flushed = flush_locked();
  if (std::holds_alternative<SpoolError>(flushed))
    return std::get<SpoolError>(flushed);
  auto committed = std::get<std::vector<CommittedPacket>>(flushed);
  deferred_committed_.insert(deferred_committed_.end(),
                             std::make_move_iterator(committed.begin()),
                             std::make_move_iterator(committed.end()));
  if (!sink_->close()) {
    ++write_failures_;
    return SpoolError{SpoolFailureReason::FinalizeFailed,
                      "Unable to close a completed pcapng spool segment.",
                      sink_->last_error()};
  }
  sink_.reset();
  return open_segment();
}

std::optional<SpoolError> PcapngSpool::evict_oldest_segment() noexcept {
  if (segments_.empty())
    return std::nullopt;
  auto current = segments_.back().id;
  auto candidate = std::find_if(
      segments_.begin(), segments_.end(), [current](const Segment &segment) {
        return !segment.evicted && segment.id != current &&
               segment.lease_count == 0;
      });
  if (candidate == segments_.end())
    return SpoolError{
        SpoolFailureReason::QuotaExceeded,
        "The active pcapng segment cannot be evicted to satisfy the quota.", 0};
  std::error_code error;
  std::filesystem::remove(candidate->path, error);
  if (error)
    return SpoolError{SpoolFailureReason::WriteFailed,
                      "Unable to evict pcapng segment: " +
                          candidate->path.string(),
                      error.value()};
  candidate->evicted = true;
  bytes_retained_ -= candidate->bytes;
  evicted_bytes_ += candidate->bytes;
  for (auto &entry : index_) {
    if (entry.packet.segment_id == candidate->id && entry.committed &&
        !entry.evicted) {
      entry.evicted = true;
      ++evicted_packets_;
    }
  }
  return std::nullopt;
}

std::optional<SpoolError>
PcapngSpool::enforce_retention(std::size_t incoming_bytes) noexcept {
  if (options_.max_total_bytes == 0 ||
      bytes_retained_ + incoming_bytes <= options_.max_total_bytes)
    return std::nullopt;
  if (!options_.ring_mode)
    return SpoolError{SpoolFailureReason::QuotaExceeded,
                      "The configured pcapng spool quota was reached.", 0};
  while (bytes_retained_ + incoming_bytes > options_.max_total_bytes) {
    if (auto error = evict_oldest_segment())
      return error;
  }
  return std::nullopt;
}

std::optional<SpoolError>
PcapngSpool::append(const sniffing::PacketMetadata &metadata,
                    std::span<const std::byte> bytes) noexcept {
  std::lock_guard lock(mutex_);
  if (finalized_)
    return SpoolError{SpoolFailureReason::FinalizeFailed,
                      "The pcapng spool is finalized.", 0};
  if (metadata.key.capture_id != capture_id_ ||
      metadata.captured_len != bytes.size())
    return SpoolError{
        SpoolFailureReason::InvalidPacket,
        "Packet metadata does not match the pcapng spool session.", 0};
  const auto interface = std::find_if(
      interfaces_.begin(), interfaces_.end(), [&](const auto &item) {
        return item.interface_id == metadata.interface_id;
      });
  if (interface == interfaces_.end())
    return SpoolError{
        SpoolFailureReason::InvalidPacket,
        "Packet references an interface absent from the pcapng section.", 0};
  if (packet_index_.contains(metadata.key.packet_id))
    return SpoolError{SpoolFailureReason::InvalidPacket,
                      "Packet identity is duplicated within the pcapng spool.",
                      0};
  const auto interface_index =
      static_cast<std::uint32_t>(std::distance(interfaces_.begin(), interface));
  auto block = internal::encode_enhanced_packet(
      metadata, interface_index, interface->timestamp_resolution, bytes);
  if (auto error = rotate_if_needed(block.size())) {
    preserve_on_destroy_ = true;
    return error;
  }
  if (auto error = enforce_retention(block.size())) {
    preserve_on_destroy_ = true;
    return error;
  }

  IndexEntry entry;
  entry.packet.metadata = metadata;
  entry.packet.ordinal = index_.size();
  entry.packet.segment_id = segments_.back().id;
  entry.packet.block_offset = current_offset_;
  entry.packet.data_offset = current_offset_ + 28;
  entry.packet.block_length = static_cast<std::uint32_t>(block.size());
  if (auto error = write_block(block))
    return error;
  segments_.back().packets++;
  pending_bytes_ += bytes.size();
  pending_indices_.push_back(index_.size());
  packet_index_.emplace(metadata.key.packet_id, index_.size());
  index_.push_back(std::move(entry));
  return std::nullopt;
}

std::variant<std::vector<CommittedPacket>, SpoolError>
PcapngSpool::flush_locked() noexcept {
  if (pending_indices_.empty())
    return std::vector<CommittedPacket>{};
  if (!sink_ || !sink_->flush()) {
    ++flush_failures_;
    preserve_on_destroy_ = true;
    return SpoolError{SpoolFailureReason::FlushFailed,
                      "Unable to flush complete pcapng packet blocks.",
                      sink_ ? sink_->last_error() : 0};
  }
  std::vector<CommittedPacket> committed;
  committed.reserve(pending_indices_.size());
  for (const auto index : pending_indices_) {
    index_[index].committed = true;
    committed.push_back(index_[index].packet);
    const auto packet_end =
        index_[index].packet.block_offset + index_[index].packet.block_length;
    const auto segment = std::find_if(
        segments_.begin(), segments_.end(), [&](const Segment &item) {
          return item.id == index_[index].packet.segment_id;
        });
    if (segment != segments_.end()) {
      segment->committed_bytes = std::max(segment->committed_bytes, packet_end);
      if (segment->committed_packets == 0)
        segment->first_packet_id = index_[index].packet.metadata.key.packet_id;
      ++segment->committed_packets;
      segment->last_packet_id = index_[index].packet.metadata.key.packet_id;
    }
    last_committed_packet_id_ = std::max(
        last_committed_packet_id_, index_[index].packet.metadata.key.packet_id);
  }
  pending_indices_.clear();
  pending_bytes_ = 0;
  last_flush_ = std::chrono::steady_clock::now();
  return committed;
}

std::variant<std::vector<CommittedPacket>, SpoolError>
PcapngSpool::flush() noexcept {
  std::lock_guard lock(mutex_);
  auto flushed = flush_locked();
  if (std::holds_alternative<SpoolError>(flushed))
    return std::get<SpoolError>(flushed);
  auto committed = std::move(deferred_committed_);
  deferred_committed_.clear();
  auto current = std::get<std::vector<CommittedPacket>>(std::move(flushed));
  committed.insert(committed.end(), std::make_move_iterator(current.begin()),
                   std::make_move_iterator(current.end()));
  return committed;
}

std::variant<std::vector<CommittedPacket>, SpoolError>
PcapngSpool::flush_if_due() noexcept {
  std::lock_guard lock(mutex_);
  if (pending_indices_.empty()) {
    auto committed = std::move(deferred_committed_);
    deferred_committed_.clear();
    return committed;
  }
  const auto due_by_size =
      options_.flush_bytes == 0 || pending_bytes_ >= options_.flush_bytes;
  const auto due_by_time =
      options_.flush_interval.count() <= 0 ||
      std::chrono::steady_clock::now() - last_flush_ >= options_.flush_interval;
  if (!due_by_size && !due_by_time) {
    auto committed = std::move(deferred_committed_);
    deferred_committed_.clear();
    return committed;
  }
  auto flushed = flush_locked();
  if (std::holds_alternative<SpoolError>(flushed))
    return std::get<SpoolError>(flushed);
  auto committed = std::move(deferred_committed_);
  deferred_committed_.clear();
  auto current = std::get<std::vector<CommittedPacket>>(std::move(flushed));
  committed.insert(committed.end(), std::make_move_iterator(current.begin()),
                   std::make_move_iterator(current.end()));
  return committed;
}

std::variant<std::vector<CommittedPacket>, SpoolError>
PcapngSpool::finalize() noexcept {
  std::lock_guard lock(mutex_);
  if (finalized_)
    return std::vector<CommittedPacket>{};
  auto flushed = flush_locked();
  if (std::holds_alternative<SpoolError>(flushed))
    return std::get<SpoolError>(flushed);
  auto committed = std::move(deferred_committed_);
  deferred_committed_.clear();
  auto current = std::get<std::vector<CommittedPacket>>(std::move(flushed));
  committed.insert(committed.end(), std::make_move_iterator(current.begin()),
                   std::make_move_iterator(current.end()));
  if (sink_ && !sink_->close()) {
    ++write_failures_;
    preserve_on_destroy_ = true;
    return SpoolError{SpoolFailureReason::FinalizeFailed,
                      "Unable to finalize the pcapng spool segment.",
                      sink_->last_error()};
  }
  sink_.reset();
  finalized_ = true;
  return committed;
}

PacketSpoolLookup PcapngSpool::lookup(const sniffing::PacketKey &key) const {
  std::lock_guard lock(mutex_);
  if (key.capture_id != capture_id_)
    return {};
  const auto indexed = packet_index_.find(key.packet_id);
  if (indexed == packet_index_.end())
    return {};
  const auto &entry = index_[indexed->second];
  if (!entry.committed)
    return {};
  if (entry.evicted)
    return {PacketSpoolLookupStatus::Evicted, std::nullopt};
  const auto segment = std::find_if(
      segments_.begin(), segments_.end(),
      [&](const Segment &item) { return item.id == entry.packet.segment_id; });
  if (segment == segments_.end() || segment->evicted)
    return {PacketSpoolLookupStatus::Evicted, std::nullopt};
  std::ifstream input(segment->path, std::ios::binary);
  if (!input)
    return {PacketSpoolLookupStatus::Corrupt, std::nullopt};
  PersistedPacket packet;
  packet.metadata = entry.packet.metadata;
  packet.bytes.resize(packet.metadata.captured_len);
  input.seekg(static_cast<std::streamoff>(entry.packet.data_offset));
  input.read(reinterpret_cast<char *>(packet.bytes.data()),
             static_cast<std::streamsize>(packet.bytes.size()));
  if (!input)
    return {PacketSpoolLookupStatus::Corrupt, std::nullopt};
  return {PacketSpoolLookupStatus::Found, std::move(packet)};
}

PacketSpoolLookup PcapngSpool::lookup_ordinal(std::uint64_t ordinal) const {
  const auto packet = committed_packet(ordinal);
  if (!packet)
    return {};
  return lookup(packet->metadata.key);
}

std::optional<CommittedPacket>
PcapngSpool::committed_packet(std::uint64_t ordinal) const {
  std::lock_guard lock(mutex_);
  if (ordinal >= index_.size() || !index_[ordinal].committed)
    return std::nullopt;
  return index_[ordinal].packet;
}

std::uint64_t PcapngSpool::committed_count() const noexcept {
  std::lock_guard lock(mutex_);
  return index_.size() - pending_indices_.size();
}

PcapngSpoolStats PcapngSpool::stats() const noexcept {
  std::lock_guard lock(mutex_);
  PcapngSpoolStats stats;
  stats.packets_persisted = index_.size() - pending_indices_.size();
  stats.bytes_written = bytes_written_;
  stats.bytes_retained = bytes_retained_;
  stats.quota_bytes = options_.max_total_bytes;
  stats.evicted_packets = evicted_packets_;
  stats.evicted_bytes = evicted_bytes_;
  stats.write_failures = write_failures_;
  stats.flush_failures = flush_failures_;
  stats.last_committed_packet_id = last_committed_packet_id_;
  stats.pending_packets = pending_indices_.size();
  stats.pending_bytes = pending_bytes_;
  stats.segments =
      std::count_if(segments_.begin(), segments_.end(),
                    [](const Segment &segment) { return !segment.evicted; });
  return stats;
}

std::vector<std::filesystem::path> PcapngSpool::segment_paths() const {
  std::lock_guard lock(mutex_);
  std::vector<std::filesystem::path> paths;
  for (const auto &segment : segments_)
    if (!segment.evicted)
      paths.push_back(segment.path);
  return paths;
}

std::vector<PcapngSegmentSnapshot> PcapngSpool::segment_snapshots() const {
  std::lock_guard lock(mutex_);
  std::vector<PcapngSegmentSnapshot> snapshots;
  snapshots.reserve(segments_.size());
  for (const auto &segment : segments_) {
    snapshots.push_back({segment.id, segment.path, segment.committed_bytes,
                         segment.committed_packets, segment.first_packet_id,
                         segment.last_packet_id, segment.evicted});
  }
  return snapshots;
}

std::vector<PcapngSegmentSnapshot> PcapngSpool::lease_snapshot() {
  std::lock_guard lock(mutex_);
  std::vector<PcapngSegmentSnapshot> snapshots;
  snapshots.reserve(segments_.size());
  for (auto &segment : segments_) {
    if (segment.evicted || segment.committed_bytes == 0)
      continue;
    ++segment.lease_count;
    snapshots.push_back({segment.id, segment.path, segment.committed_bytes,
                         segment.committed_packets, segment.first_packet_id,
                         segment.last_packet_id, false});
  }
  return snapshots;
}

void PcapngSpool::release_leases(
    std::span<const std::uint64_t> segment_ids) noexcept {
  std::lock_guard lock(mutex_);
  for (const auto id : segment_ids) {
    const auto segment =
        std::find_if(segments_.begin(), segments_.end(),
                     [id](const Segment &item) { return item.id == id; });
    if (segment != segments_.end() && segment->lease_count != 0)
      --segment->lease_count;
  }
}

std::variant<PcapngSpool::RecoveryResult, SpoolError>
PcapngSpool::recover_segment(const std::filesystem::path &path,
                             bool truncate_partial_tail) {
  return internal::recover_segment(path, truncate_partial_tail);
}

std::string to_string(SpoolFailureReason reason) {
  switch (reason) {
  case SpoolFailureReason::DirectoryUnavailable:
    return "DirectoryUnavailable";
  case SpoolFailureReason::OpenFailed:
    return "OpenFailed";
  case SpoolFailureReason::ShortWrite:
    return "ShortWrite";
  case SpoolFailureReason::WriteFailed:
    return "WriteFailed";
  case SpoolFailureReason::FlushFailed:
    return "FlushFailed";
  case SpoolFailureReason::FinalizeFailed:
    return "FinalizeFailed";
  case SpoolFailureReason::QuotaExceeded:
    return "QuotaExceeded";
  case SpoolFailureReason::InvalidPacket:
    return "InvalidPacket";
  case SpoolFailureReason::CorruptData:
    return "CorruptData";
  }
  return "Unknown";
}

} // namespace pruftnet::capture

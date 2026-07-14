#include "pruftnet/capture/pcapng_spool.hpp"

#include <algorithm>
#include <array>
#include <cerrno>
#include <charconv>
#include <cstdio>
#include <cstring>
#include <fstream>
#include <iomanip>
#include <limits>
#include <mutex>
#include <sstream>
#include <system_error>

namespace pruftnet::capture {
namespace {

constexpr std::uint32_t kSectionHeaderBlock = 0x0a0d0d0a;
constexpr std::uint32_t kInterfaceDescriptionBlock = 0x00000001;
constexpr std::uint32_t kEnhancedPacketBlock = 0x00000006;
constexpr std::uint32_t kByteOrderMagic = 0x1a2b3c4d;
constexpr std::size_t kMaximumRecoveryBlock = 64 * 1024 * 1024;

std::size_t padded(std::size_t value) noexcept {
  return (value + 3U) & ~std::size_t{3U};
}

void append_u16(std::vector<std::byte> &output, std::uint16_t value) {
  output.push_back(std::byte(value & 0xffU));
  output.push_back(std::byte((value >> 8U) & 0xffU));
}

void append_u32(std::vector<std::byte> &output, std::uint32_t value) {
  for (unsigned shift = 0; shift < 32; shift += 8)
    output.push_back(std::byte((value >> shift) & 0xffU));
}

void append_u64(std::vector<std::byte> &output, std::uint64_t value) {
  for (unsigned shift = 0; shift < 64; shift += 8)
    output.push_back(std::byte((value >> shift) & 0xffU));
}

std::uint16_t read_u16(const std::byte *bytes) noexcept {
  return std::uint16_t(std::to_integer<unsigned char>(bytes[0])) |
         (std::uint16_t(std::to_integer<unsigned char>(bytes[1])) << 8U);
}

std::uint32_t read_u32(const std::byte *bytes) noexcept {
  std::uint32_t value = 0;
  for (unsigned shift = 0; shift < 32; shift += 8)
    value |= std::uint32_t(std::to_integer<unsigned char>(bytes[shift / 8]))
             << shift;
  return value;
}

void append_option(std::vector<std::byte> &output, std::uint16_t code,
                   std::span<const std::byte> value) {
  append_u16(output, code);
  append_u16(output, static_cast<std::uint16_t>(value.size()));
  output.insert(output.end(), value.begin(), value.end());
  output.resize(output.size() + padded(value.size()) - value.size(),
                std::byte{0});
}

void append_string_option(std::vector<std::byte> &output, std::uint16_t code,
                          std::string_view value) {
  append_option(output, code,
                std::as_bytes(std::span(value.data(), value.size())));
}

void append_end_option(std::vector<std::byte> &output) {
  append_u16(output, 0);
  append_u16(output, 0);
}

std::vector<std::byte> finish_block(std::uint32_t type,
                                    std::vector<std::byte> body) {
  const auto length = static_cast<std::uint32_t>(12 + body.size());
  std::vector<std::byte> block;
  block.reserve(length);
  append_u32(block, type);
  append_u32(block, length);
  block.insert(block.end(), body.begin(), body.end());
  append_u32(block, length);
  return block;
}

std::string capture_hex(sniffing::CaptureId id) {
  std::ostringstream output;
  output << std::hex << std::setfill('0') << std::setw(16) << id.high
         << std::setw(16) << id.low;
  return output.str();
}

std::vector<std::byte> section_header(sniffing::CaptureId capture_id) {
  std::vector<std::byte> body;
  append_u32(body, kByteOrderMagic);
  append_u16(body, 1);
  append_u16(body, 0);
  append_u64(body, std::numeric_limits<std::uint64_t>::max());
  append_string_option(body, 1,
                       "pruftnet.capture_id=" + capture_hex(capture_id));
  append_string_option(body, 4, "Pruftnet capture spool");
  append_end_option(body);
  return finish_block(kSectionHeaderBlock, std::move(body));
}

std::vector<std::byte> interface_description(const SpoolInterface &interface) {
  std::vector<std::byte> body;
  append_u16(body, interface.link_type);
  append_u16(body, 0);
  append_u32(body, interface.snaplen);
  append_string_option(body, 1,
                       "pruftnet.interface_id=" +
                           std::to_string(interface.interface_id));
  append_string_option(body, 2, interface.name);
  const std::array resolution{std::byte(interface.timestamp_resolution)};
  append_option(body, 9, resolution);
  append_end_option(body);
  return finish_block(kInterfaceDescriptionBlock, std::move(body));
}

std::vector<std::byte> enhanced_packet(const sniffing::PacketMetadata &metadata,
                                       std::uint32_t interface_index,
                                       std::uint8_t timestamp_resolution,
                                       std::span<const std::byte> bytes) {
  std::vector<std::byte> body;
  body.reserve(32 + padded(bytes.size()) + 96);
  append_u32(body, interface_index);
  const auto timestamp = timestamp_resolution == 6
                             ? metadata.timestamp_ns / 1'000
                             : metadata.timestamp_ns;
  append_u32(body, static_cast<std::uint32_t>(timestamp >> 32U));
  append_u32(body, static_cast<std::uint32_t>(timestamp));
  append_u32(body, metadata.captured_len);
  append_u32(body, metadata.wire_len);
  body.insert(body.end(), bytes.begin(), bytes.end());
  body.resize(body.size() + padded(bytes.size()) - bytes.size(), std::byte{0});
  append_string_option(
      body, 1,
      "pruftnet.packet_id=" + std::to_string(metadata.key.packet_id) +
          ";flags=" + std::to_string(metadata.flags));
  append_end_option(body);
  return finish_block(kEnhancedPacketBlock, std::move(body));
}

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

std::optional<std::string_view> option_string(std::span<const std::byte> block,
                                              std::size_t offset,
                                              std::uint16_t requested) {
  while (offset + 4 <= block.size() - 4) {
    const auto code = read_u16(block.data() + offset);
    const auto length = read_u16(block.data() + offset + 2);
    offset += 4;
    if (code == 0)
      return std::nullopt;
    if (offset + padded(length) > block.size() - 4)
      return std::nullopt;
    if (code == requested) {
      return std::string_view(
          reinterpret_cast<const char *>(block.data() + offset), length);
    }
    offset += padded(length);
  }
  return std::nullopt;
}

bool parse_u64(std::string_view value, std::uint64_t &output, int base = 10) {
  const auto result =
      std::from_chars(value.data(), value.data() + value.size(), output, base);
  return result.ec == std::errc{} && result.ptr == value.data() + value.size();
}

std::optional<sniffing::CaptureId>
parse_capture_comment(std::string_view comment) {
  constexpr std::string_view prefix = "pruftnet.capture_id=";
  if (!comment.starts_with(prefix) || comment.size() != prefix.size() + 32)
    return std::nullopt;
  sniffing::CaptureId id;
  if (!parse_u64(comment.substr(prefix.size(), 16), id.high, 16) ||
      !parse_u64(comment.substr(prefix.size() + 16), id.low, 16))
    return std::nullopt;
  return id;
}

bool parse_packet_comment(std::string_view comment, std::uint64_t &packet_id,
                          std::uint32_t &flags) {
  constexpr std::string_view prefix = "pruftnet.packet_id=";
  constexpr std::string_view separator = ";flags=";
  if (!comment.starts_with(prefix))
    return false;
  const auto split = comment.find(separator, prefix.size());
  if (split == std::string_view::npos)
    return false;
  std::uint64_t raw_flags = 0;
  if (!parse_u64(comment.substr(prefix.size(), split - prefix.size()),
                 packet_id) ||
      !parse_u64(comment.substr(split + separator.size()), raw_flags) ||
      raw_flags > std::numeric_limits<std::uint32_t>::max())
    return false;
  flags = static_cast<std::uint32_t>(raw_flags);
  return true;
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
    filename << options_.file_prefix << '-' << capture_hex(capture_id_) << '-'
             << std::setfill('0') << std::setw(6) << segment_id << ".pcapng";
    Segment segment{segment_id, options_.directory / filename.str()};
    SpoolError error;
    sink_ = sink_factory_(segment.path, error);
    if (!sink_)
      return error;
    segments_.push_back(std::move(segment));
    current_offset_ = 0;

    auto shb = section_header(capture_id_);
    std::vector<std::vector<std::byte>> interface_blocks;
    interface_blocks.reserve(interfaces_.size());
    std::size_t header_bytes = shb.size();
    for (const auto &interface : interfaces_) {
      interface_blocks.push_back(interface_description(interface));
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
  auto block = enhanced_packet(metadata, interface_index,
                               interface->timestamp_resolution, bytes);
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
  std::ifstream input(path, std::ios::binary);
  if (!input)
    return SpoolError{
        SpoolFailureReason::OpenFailed,
        "Unable to open pcapng segment for recovery: " + path.string(), errno};
  std::error_code size_error;
  const auto file_size = std::filesystem::file_size(path, size_error);
  if (size_error)
    return SpoolError{SpoolFailureReason::OpenFailed,
                      "Unable to stat pcapng segment for recovery.",
                      size_error.value()};

  RecoveryResult result;
  sniffing::CaptureId capture_id;
  bool have_section = false;
  std::vector<SpoolInterface> interfaces;
  std::uint64_t offset = 0;
  while (offset + 12 <= file_size) {
    std::array<std::byte, 8> header{};
    input.seekg(static_cast<std::streamoff>(offset));
    input.read(reinterpret_cast<char *>(header.data()), header.size());
    if (!input)
      break;
    const auto type = read_u32(header.data());
    const auto length = read_u32(header.data() + 4);
    if (length < 12 || length % 4 != 0 || length > kMaximumRecoveryBlock ||
        offset + length > file_size)
      break;
    std::vector<std::byte> block(length);
    input.seekg(static_cast<std::streamoff>(offset));
    input.read(reinterpret_cast<char *>(block.data()), length);
    if (!input || read_u32(block.data() + length - 4) != length)
      break;

    if (type == kSectionHeaderBlock) {
      if (length < 28 || read_u32(block.data() + 8) != kByteOrderMagic)
        return SpoolError{SpoolFailureReason::CorruptData,
                          "The pcapng section header is invalid.", 0};
      const auto comment = option_string(block, 24, 1);
      const auto parsed_capture =
          comment ? parse_capture_comment(*comment) : std::nullopt;
      if (!parsed_capture || parsed_capture->is_nil())
        return SpoolError{SpoolFailureReason::CorruptData,
                          "The pcapng section lacks a valid capture identity.",
                          0};
      capture_id = *parsed_capture;
      result.capture_id = capture_id;
      have_section = true;
    } else if (type == kInterfaceDescriptionBlock && have_section) {
      if (length < 24)
        break;
      SpoolInterface interface;
      interface.link_type = read_u16(block.data() + 8);
      interface.snaplen = read_u32(block.data() + 12);
      interface.interface_id = interfaces.size();
      if (const auto comment = option_string(block, 16, 1)) {
        constexpr std::string_view prefix = "pruftnet.interface_id=";
        std::uint64_t id = 0;
        if (comment->starts_with(prefix) &&
            parse_u64(comment->substr(prefix.size()), id) &&
            id <= std::numeric_limits<std::uint32_t>::max())
          interface.interface_id = static_cast<std::uint32_t>(id);
      }
      if (const auto name = option_string(block, 16, 2))
        interface.name = *name;
      if (const auto resolution = option_string(block, 16, 9);
          resolution && resolution->size() == 1)
        interface.timestamp_resolution =
            static_cast<std::uint8_t>((*resolution)[0]);
      interfaces.push_back(std::move(interface));
    } else if (type == kEnhancedPacketBlock && have_section) {
      if (length < 36)
        break;
      const auto interface_index = read_u32(block.data() + 8);
      const auto captured_length = read_u32(block.data() + 20);
      const auto wire_length = read_u32(block.data() + 24);
      const auto options_offset = 28 + padded(captured_length);
      if (interface_index >= interfaces.size() ||
          options_offset + 4 > length - 4)
        break;
      const auto comment = option_string(block, options_offset, 1);
      std::uint64_t packet_id = 0;
      std::uint32_t flags = 0;
      if (!comment || !parse_packet_comment(*comment, packet_id, flags))
        break;
      CommittedPacket packet;
      packet.ordinal = result.packets.size();
      packet.segment_id = 1;
      packet.block_offset = offset;
      packet.data_offset = offset + 28;
      packet.block_length = length;
      packet.metadata.key = {capture_id, packet_id};
      const auto timestamp =
          (std::uint64_t(read_u32(block.data() + 12)) << 32U) |
          read_u32(block.data() + 16);
      if (interfaces[interface_index].timestamp_resolution == 6 &&
          timestamp > std::numeric_limits<std::uint64_t>::max() / 1'000)
        break;
      packet.metadata.timestamp_ns =
          interfaces[interface_index].timestamp_resolution == 6
              ? timestamp * 1'000
              : timestamp;
      packet.metadata.interface_id = interfaces[interface_index].interface_id;
      packet.metadata.captured_len = captured_length;
      packet.metadata.wire_len = wire_length;
      packet.metadata.link_type = interfaces[interface_index].link_type;
      packet.metadata.flags = flags;
      result.packets.push_back(packet);
    }
    offset += length;
    result.valid_bytes = offset;
  }
  if (!have_section)
    return SpoolError{SpoolFailureReason::CorruptData,
                      "No valid pcapng section header was recovered.", 0};
  result.truncated_bytes = file_size - result.valid_bytes;
  if (truncate_partial_tail && result.truncated_bytes != 0) {
    std::error_code resize_error;
    std::filesystem::resize_file(path, result.valid_bytes, resize_error);
    if (resize_error)
      return SpoolError{SpoolFailureReason::FinalizeFailed,
                        "Unable to truncate the invalid pcapng tail.",
                        resize_error.value()};
  }
  return result;
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

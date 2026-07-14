#include <array>
#include <cassert>
#include <cerrno>
#include <filesystem>
#include <fstream>
#include <memory>

#include "pruftnet/capture/pcapng_spool.hpp"

using namespace pruftnet;

namespace {

struct FaultState {
  std::size_t write_calls = 0;
  std::size_t flush_calls = 0;
  std::size_t close_calls = 0;
  std::size_t fail_write_call = 0;
  std::size_t fail_flush_call = 0;
  std::size_t fail_close_call = 0;
};

class FaultSink final : public capture::SpoolSink {
public:
  explicit FaultSink(std::shared_ptr<FaultState> state)
      : state_(std::move(state)) {}

  std::size_t write(std::span<const std::byte> bytes) noexcept override {
    ++state_->write_calls;
    if (state_->write_calls == state_->fail_write_call) {
      error_ = ENOSPC;
      return bytes.size() / 2;
    }
    return bytes.size();
  }

  bool flush() noexcept override {
    ++state_->flush_calls;
    if (state_->flush_calls != state_->fail_flush_call)
      return true;
    error_ = ENOSPC;
    return false;
  }

  bool close() noexcept override {
    ++state_->close_calls;
    if (state_->close_calls != state_->fail_close_call)
      return true;
    error_ = EIO;
    return false;
  }

  int last_error() const noexcept override { return error_; }

private:
  std::shared_ptr<FaultState> state_;
  int error_ = 0;
};

class LimitedFileSink final : public capture::SpoolSink {
public:
  explicit LimitedFileSink(const std::filesystem::path &path)
      : output_(path, std::ios::binary | std::ios::trunc) {}

  std::size_t write(std::span<const std::byte> bytes) noexcept override {
    ++writes_;
    const auto count = writes_ == 4 ? bytes.size() / 2 : bytes.size();
    output_.write(reinterpret_cast<const char *>(bytes.data()),
                  static_cast<std::streamsize>(count));
    if (!output_) {
      error_ = EIO;
      return 0;
    }
    if (count != bytes.size())
      error_ = ENOSPC;
    return count;
  }

  bool flush() noexcept override {
    output_.flush();
    return static_cast<bool>(output_);
  }

  bool close() noexcept override {
    output_.close();
    return !output_.fail();
  }

  int last_error() const noexcept override { return error_; }

private:
  std::ofstream output_;
  std::size_t writes_ = 0;
  int error_ = 0;
};

capture::SpoolSinkFactory
fault_factory(const std::shared_ptr<FaultState> &state) {
  return [state](const std::filesystem::path &, capture::SpoolError &) {
    return std::make_unique<FaultSink>(state);
  };
}

sniffing::PacketMetadata metadata(sniffing::CaptureId capture_id,
                                  std::uint64_t packet_id,
                                  std::uint32_t interface_id = 0) {
  return {{capture_id, packet_id}, packet_id, interface_id, 4, 4, 1, 0};
}

std::filesystem::path test_directory() {
  auto path =
      std::filesystem::temp_directory_path() / "pruftnet-pcapng-spool-test";
  std::error_code error;
  std::filesystem::remove_all(path, error);
  std::filesystem::create_directories(path);
  return path;
}

void writes_recovers_and_reads_committed_packets() {
  capture::PcapngSpoolOptions options;
  options.directory = test_directory();
  options.flush_bytes = 1;
  const sniffing::CaptureId capture_id{1, 2};
  auto created = capture::PcapngSpool::create(
      options, capture_id,
      {{7, "fake0", 1, 65535, 6}, {9, "fake1", 1, 65535, 9}});
  assert(
      std::holds_alternative<std::unique_ptr<capture::PcapngSpool>>(created));
  auto spool =
      std::move(std::get<std::unique_ptr<capture::PcapngSpool>>(created));

  const std::array payload{std::byte{1}, std::byte{2}, std::byte{3}};
  sniffing::PacketMetadata metadata;
  metadata.key = {capture_id, 11};
  metadata.timestamp_ns = 123456000;
  metadata.interface_id = 7;
  metadata.captured_len = payload.size();
  metadata.wire_len = 9;
  metadata.link_type = 1;
  metadata.flags = sniffing::PacketFlagTruncated;
  assert(!spool->append(metadata, payload));
  auto second = metadata;
  second.key.packet_id = 12;
  second.timestamp_ns = 987654321;
  second.interface_id = 9;
  assert(!spool->append(second, payload));
  const auto flushed = spool->flush();
  assert(
      std::holds_alternative<std::vector<capture::CommittedPacket>>(flushed));
  assert(std::get<std::vector<capture::CommittedPacket>>(flushed).size() == 2);

  const auto lookup = spool->lookup(metadata.key);
  assert(lookup.status == capture::PacketSpoolLookupStatus::Found);
  assert(lookup.packet->bytes ==
         std::vector<std::byte>(payload.begin(), payload.end()));
  const auto paths = spool->segment_paths();
  assert(paths.size() == 1);
  assert(std::holds_alternative<std::vector<capture::CommittedPacket>>(
      spool->finalize()));

  const auto recovered =
      capture::PcapngSpool::recover_segment(paths.front(), false);
  assert(
      std::holds_alternative<capture::PcapngSpool::RecoveryResult>(recovered));
  const auto &result =
      std::get<capture::PcapngSpool::RecoveryResult>(recovered);
  assert(result.truncated_bytes == 0);
  assert(result.packets.size() == 2);
  assert(result.packets.front().metadata.key.packet_id == 11);
  assert(result.packets.front().metadata.interface_id == 7);
  assert(result.packets.front().metadata.timestamp_ns == 123456000);
  assert(result.packets.back().metadata.interface_id == 9);
  assert(result.packets.back().metadata.timestamp_ns == 987654321);
}

void truncates_partial_tail_without_losing_valid_packets() {
  capture::PcapngSpoolOptions options;
  options.directory = test_directory();
  const sniffing::CaptureId capture_id{3, 4};
  auto created = capture::PcapngSpool::create(options, capture_id,
                                              {{0, "fake0", 1, 65535, 9}});
  auto spool =
      std::move(std::get<std::unique_ptr<capture::PcapngSpool>>(created));
  const std::array payload{std::byte{9}};
  sniffing::PacketMetadata metadata{{capture_id, 1}, 1, 0, 1, 1, 1, 0};
  assert(!spool->append(metadata, payload));
  assert(std::holds_alternative<std::vector<capture::CommittedPacket>>(
      spool->finalize()));
  const auto path = spool->segment_paths().front();
  {
    std::ofstream output(path, std::ios::binary | std::ios::app);
    output.write("bad", 3);
  }
  const auto before = std::filesystem::file_size(path);
  const auto recovered = capture::PcapngSpool::recover_segment(path, true);
  assert(
      std::holds_alternative<capture::PcapngSpool::RecoveryResult>(recovered));
  const auto &result =
      std::get<capture::PcapngSpool::RecoveryResult>(recovered);
  assert(result.truncated_bytes == 3);
  assert(std::filesystem::file_size(path) == before - 3);
}

void reports_short_writes_and_flush_failures_without_committing_packets() {
  const std::array payload{std::byte{1}, std::byte{2}, std::byte{3},
                           std::byte{4}};
  const sniffing::CaptureId capture_id{5, 6};
  capture::PcapngSpoolOptions options;
  options.directory = test_directory();

  auto short_state = std::make_shared<FaultState>();
  short_state->fail_write_call = 3;
  auto short_created = capture::PcapngSpool::create(options, capture_id,
                                                    {{0, "fake0", 1, 65535, 9}},
                                                    fault_factory(short_state));
  auto short_spool =
      std::move(std::get<std::unique_ptr<capture::PcapngSpool>>(short_created));
  const auto short_error =
      short_spool->append(metadata(capture_id, 1), payload);
  assert(short_error &&
         short_error->reason == capture::SpoolFailureReason::ShortWrite);
  assert(short_error->system_error == ENOSPC);
  assert(short_spool->stats().write_failures == 1);
  assert(short_spool->stats().packets_persisted == 0);

  auto flush_state = std::make_shared<FaultState>();
  flush_state->fail_flush_call = 2;
  auto flush_created = capture::PcapngSpool::create(options, capture_id,
                                                    {{0, "fake0", 1, 65535, 9}},
                                                    fault_factory(flush_state));
  auto flush_spool =
      std::move(std::get<std::unique_ptr<capture::PcapngSpool>>(flush_created));
  assert(!flush_spool->append(metadata(capture_id, 2), payload));
  const auto flushed = flush_spool->flush();
  assert(std::holds_alternative<capture::SpoolError>(flushed));
  assert(std::get<capture::SpoolError>(flushed).reason ==
         capture::SpoolFailureReason::FlushFailed);
  assert(flush_spool->stats().flush_failures == 1);
  assert(flush_spool->stats().packets_persisted == 0);
}

void publishes_rotation_commits_and_observes_ring_eviction() {
  capture::PcapngSpoolOptions options;
  options.directory = test_directory();
  options.segment_bytes = 1;
  options.max_segments = 2;
  options.ring_mode = true;
  options.flush_bytes = 1024 * 1024;
  const sniffing::CaptureId capture_id{7, 8};
  auto created = capture::PcapngSpool::create(
      options, capture_id,
      {{7, "fake0", 1, 65535, 9}, {9, "fake1", 1, 65535, 9}});
  auto spool =
      std::move(std::get<std::unique_ptr<capture::PcapngSpool>>(created));
  const std::array payload{std::byte{1}, std::byte{2}, std::byte{3},
                           std::byte{4}};

  assert(!spool->append(metadata(capture_id, 1, 7), payload));
  assert(!spool->append(metadata(capture_id, 2, 9), payload));
  auto first_flush = spool->flush();
  assert(std::holds_alternative<std::vector<capture::CommittedPacket>>(
      first_flush));
  assert(std::get<std::vector<capture::CommittedPacket>>(first_flush).size() ==
         2);
  assert(!spool->append(metadata(capture_id, 3, 7), payload));
  auto second_flush = spool->flush();
  assert(std::holds_alternative<std::vector<capture::CommittedPacket>>(
      second_flush));
  assert(std::get<std::vector<capture::CommittedPacket>>(second_flush).size() ==
         1);

  const auto stats = spool->stats();
  assert(stats.packets_persisted == 3);
  assert(stats.segments == 2);
  assert(stats.evicted_packets == 1);
  assert(stats.evicted_bytes > 0);
  assert(spool->lookup({capture_id, 1}).status ==
         capture::PacketSpoolLookupStatus::Evicted);
  assert(spool->lookup({capture_id, 2}).status ==
         capture::PacketSpoolLookupStatus::Found);
  assert(spool->lookup({capture_id, 3}).status ==
         capture::PacketSpoolLookupStatus::Found);
}

void leased_segments_are_not_evicted() {
  capture::PcapngSpoolOptions options;
  options.directory = test_directory();
  options.segment_bytes = 1;
  options.max_segments = 2;
  options.ring_mode = true;
  options.flush_bytes = 1;
  const sniffing::CaptureId capture_id{17, 18};
  auto created = capture::PcapngSpool::create(options, capture_id,
                                              {{0, "fake0", 1, 65535, 9}});
  auto spool =
      std::move(std::get<std::unique_ptr<capture::PcapngSpool>>(created));
  const std::array payload{std::byte{1}, std::byte{2}, std::byte{3},
                           std::byte{4}};

  assert(!spool->append(metadata(capture_id, 1), payload));
  assert(std::holds_alternative<std::vector<capture::CommittedPacket>>(
      spool->flush()));
  const auto leased = spool->lease_snapshot();
  assert(leased.size() == 1);
  const std::array leased_ids{leased.front().id};

  assert(!spool->append(metadata(capture_id, 2), payload));
  assert(std::holds_alternative<std::vector<capture::CommittedPacket>>(
      spool->flush()));
  assert(!spool->append(metadata(capture_id, 3), payload));
  assert(std::holds_alternative<std::vector<capture::CommittedPacket>>(
      spool->flush()));
  assert(spool->lookup({capture_id, 1}).status ==
         capture::PacketSpoolLookupStatus::Found);
  assert(spool->lookup({capture_id, 2}).status ==
         capture::PacketSpoolLookupStatus::Evicted);

  spool->release_leases(leased_ids);
  assert(!spool->append(metadata(capture_id, 4), payload));
  assert(std::holds_alternative<std::vector<capture::CommittedPacket>>(
      spool->flush()));
  assert(spool->lookup({capture_id, 1}).status ==
         capture::PacketSpoolLookupStatus::Evicted);
}

void reports_finalize_failures_after_complete_packet_writes() {
  capture::PcapngSpoolOptions options;
  options.directory = test_directory();
  const sniffing::CaptureId capture_id{9, 10};
  auto state = std::make_shared<FaultState>();
  state->fail_close_call = 1;
  auto created = capture::PcapngSpool::create(
      options, capture_id, {{0, "fake0", 1, 65535, 9}}, fault_factory(state));
  auto spool =
      std::move(std::get<std::unique_ptr<capture::PcapngSpool>>(created));
  const std::array payload{std::byte{1}, std::byte{2}, std::byte{3},
                           std::byte{4}};
  assert(!spool->append(metadata(capture_id, 1), payload));
  const auto finalized = spool->finalize();
  assert(std::holds_alternative<capture::SpoolError>(finalized));
  assert(std::get<capture::SpoolError>(finalized).reason ==
         capture::SpoolFailureReason::FinalizeFailed);
}

void disk_full_recovery_preserves_an_independently_readable_prefix() {
  capture::PcapngSpoolOptions options;
  options.directory = test_directory();
  options.temporary = false;
  const sniffing::CaptureId capture_id{11, 12};
  auto created = capture::PcapngSpool::create(
      options, capture_id, {{0, "fake0", 1, 65535, 9}},
      [](const std::filesystem::path &path, capture::SpoolError &) {
        return std::make_unique<LimitedFileSink>(path);
      });
  auto spool =
      std::move(std::get<std::unique_ptr<capture::PcapngSpool>>(created));
  const std::array payload{std::byte{1}, std::byte{2}, std::byte{3},
                           std::byte{4}};
  assert(!spool->append(metadata(capture_id, 1), payload));
  assert(std::holds_alternative<std::vector<capture::CommittedPacket>>(
      spool->flush()));
  const auto error = spool->append(metadata(capture_id, 2), payload);
  assert(error && error->reason == capture::SpoolFailureReason::ShortWrite);
  const auto paths = spool->segment_paths();
  assert(std::holds_alternative<std::vector<capture::CommittedPacket>>(
      spool->finalize()));
  const auto recovered =
      capture::PcapngSpool::recover_segment(paths.front(), true);
  assert(
      std::holds_alternative<capture::PcapngSpool::RecoveryResult>(recovered));
  const auto &result =
      std::get<capture::PcapngSpool::RecoveryResult>(recovered);
  assert(result.packets.size() == 1);
  assert(result.truncated_bytes > 0);
}

} // namespace

int main() {
  writes_recovers_and_reads_committed_packets();
  truncates_partial_tail_without_losing_valid_packets();
  reports_short_writes_and_flush_failures_without_committing_packets();
  publishes_rotation_commits_and_observes_ring_eviction();
  leased_segments_are_not_evicted();
  reports_finalize_failures_after_complete_packet_writes();
  disk_full_recovery_preserves_an_independently_readable_prefix();
}

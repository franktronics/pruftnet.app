#include <algorithm>
#include <array>
#include <atomic>
#include <charconv>
#include <chrono>
#include <condition_variable>
#include <cstddef>
#include <cstdint>
#include <deque>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <limits>
#include <memory>
#include <mutex>
#include <optional>
#include <sstream>
#include <stdexcept>
#include <string>
#include <string_view>
#include <thread>
#include <unordered_map>
#include <unordered_set>

#ifdef _WIN32
#include <fcntl.h>
#include <io.h>
#endif

#include "parsing/packet_parser.hpp"
#include "pruftnet/parsing/packet_tree_codec.hpp"
#include "pruftnet/replay/replay_store.hpp"
#include "pruftnet/sniffing/interface_discovery.hpp"
#include "pruftnet/sniffing/network_sniffer.hpp"

namespace {
using namespace pruftnet;

constexpr std::uint32_t kMaxRequestBytes = 64 * 1024;
constexpr std::size_t kMaxSummaryRead = 1024;
constexpr std::size_t kMaxEventRead = 512;
constexpr std::size_t kMaxPendingDetailRequests = 64;
constexpr std::size_t kSummaryJournalCapacity = 32 * 1024;

std::uint64_t wall_time_ns() noexcept {
  return static_cast<std::uint64_t>(
      std::chrono::duration_cast<std::chrono::nanoseconds>(
          std::chrono::system_clock::now().time_since_epoch())
          .count());
}

std::string json_string(std::string_view value) {
  std::string out = "\"";
  for (const char c : value) {
    switch (c) {
    case '\\':
      out += "\\\\";
      break;
    case '"':
      out += "\\\"";
      break;
    case '\n':
      out += "\\n";
      break;
    case '\r':
      out += "\\r";
      break;
    case '\t':
      out += "\\t";
      break;
    default:
      if (static_cast<unsigned char>(c) >= 0x20)
        out += c;
    }
  }
  return out + '"';
}

std::optional<std::string> json_string_value(std::string_view json,
                                             std::size_t &pos) {
  if (pos >= json.size() || json[pos] != '"')
    return std::nullopt;
  std::string out;
  for (++pos; pos < json.size(); ++pos) {
    if (json[pos] == '"')
      return ++pos, out;
    if (json[pos] == '\\' && ++pos < json.size()) {
      if (json[pos] == 'b')
        out += '\b';
      else if (json[pos] == 'f')
        out += '\f';
      else if (json[pos] == 'n')
        out += '\n';
      else if (json[pos] == 'r')
        out += '\r';
      else if (json[pos] == 't')
        out += '\t';
      else if (json[pos] == 'u')
        return std::nullopt;
      else
        out += json[pos];
    } else
      out += json[pos];
  }
  return std::nullopt;
}

std::optional<std::string> field(std::string_view json, std::string_view key) {
  std::optional<std::string> found;
  std::size_t pos = 0;
  while (pos < json.size()) {
    pos = json.find('"', pos);
    if (pos == std::string_view::npos)
      break;
    const auto parsed_key = json_string_value(json, pos);
    if (!parsed_key)
      return std::nullopt;
    pos = json.find_first_not_of(" \t\r\n", pos);
    if (pos == std::string_view::npos || json[pos] != ':')
      continue;
    pos = json.find_first_not_of(" \t\r\n", pos + 1);
    if (pos == std::string_view::npos)
      return std::nullopt;

    std::optional<std::string> value;
    if (json[pos] == '"') {
      value = json_string_value(json, pos);
    } else {
      const auto end = json.find_first_of(",}", pos);
      auto raw = json.substr(pos, end - pos);
      while (!raw.empty() && (raw.back() == ' ' || raw.back() == '\t' ||
                              raw.back() == '\r' || raw.back() == '\n'))
        raw.remove_suffix(1);
      value = std::string(raw);
      pos = end == std::string_view::npos ? json.size() : end;
    }
    if (!value)
      return std::nullopt;
    if (*parsed_key == key) {
      if (found)
        return std::nullopt;
      found = std::move(value);
    }
  }
  return found;
}

std::optional<std::uint64_t> number(std::string_view json,
                                    std::string_view key) {
  const auto value = field(json, key);
  if (!value)
    return std::nullopt;
  std::uint64_t result = 0;
  const auto parsed =
      std::from_chars(value->data(), value->data() + value->size(), result);
  if (parsed.ec != std::errc{} || parsed.ptr != value->data() + value->size())
    return std::nullopt;
  return result;
}

std::optional<bool> boolean_field(std::string_view json, std::string_view key) {
  const auto value = field(json, key);
  if (value == "true")
    return true;
  if (value == "false")
    return false;
  return std::nullopt;
}

std::string decimal(std::uint64_t value) {
  return json_string(std::to_string(value));
}

enum class FrameRead { Ok, TooLarge, End, Truncated };

FrameRead read_frame(std::istream &input, std::string &payload) {
  std::array<unsigned char, 4> header{};
  input.read(reinterpret_cast<char *>(header.data()), header.size());
  if (input.gcount() == 0)
    return FrameRead::End;
  if (input.gcount() != static_cast<std::streamsize>(header.size()))
    return FrameRead::Truncated;
  const auto length =
      std::uint32_t(header[0]) | (std::uint32_t(header[1]) << 8U) |
      (std::uint32_t(header[2]) << 16U) | (std::uint32_t(header[3]) << 24U);
  if (length > kMaxRequestBytes) {
    std::array<char, 4096> discard{};
    std::uint32_t remaining = length;
    while (remaining != 0 && input) {
      const auto chunk = std::min<std::uint32_t>(remaining, discard.size());
      input.read(discard.data(), chunk);
      remaining -= static_cast<std::uint32_t>(input.gcount());
    }
    return remaining == 0 ? FrameRead::TooLarge : FrameRead::Truncated;
  }
  payload.resize(length);
  input.read(payload.data(), length);
  return input.gcount() == static_cast<std::streamsize>(length)
             ? FrameRead::Ok
             : FrameRead::Truncated;
}

void write_frame(std::ostream &output, std::string_view payload) {
  const auto length = static_cast<std::uint32_t>(payload.size());
  const std::array header{
      static_cast<unsigned char>(length & 0xffU),
      static_cast<unsigned char>((length >> 8U) & 0xffU),
      static_cast<unsigned char>((length >> 16U) & 0xffU),
      static_cast<unsigned char>((length >> 24U) & 0xffU),
  };
  output.write(reinterpret_cast<const char *>(header.data()), header.size());
  output.write(payload.data(), static_cast<std::streamsize>(payload.size()));
  output.flush();
}

std::string parse_condition(parsing::ParseCondition condition) {
  switch (condition) {
  case parsing::ParseCondition::Complete:
    return "complete";
  case parsing::ParseCondition::Partial:
    return "partial";
  case parsing::ParseCondition::Malformed:
    return "malformed";
  case parsing::ParseCondition::ResourceLimit:
    return "resourceLimit";
  }
  return "malformed";
}

std::string value_type(parsing::FieldValueType type) {
  switch (type) {
  case parsing::FieldValueType::Protocol:
    return "protocol";
  case parsing::FieldValueType::Unsigned:
    return "unsigned";
  case parsing::FieldValueType::Signed:
    return "signed";
  case parsing::FieldValueType::Boolean:
    return "boolean";
  case parsing::FieldValueType::Bytes:
    return "bytes";
  case parsing::FieldValueType::String:
    return "string";
  case parsing::FieldValueType::GeneratedText:
    return "generatedText";
  }
  return "bytes";
}

class Worker {
public:
  explicit Worker(std::unordered_map<std::string, std::string> paths)
      : paths_(std::move(paths)), journal_(kSummaryJournalCapacity),
        events_(1024) {
    auto result = parsing::make_core_registry();
    if (auto *registry = std::get_if<parsing::RegistrySnapshot>(&result))
      registry_ = std::make_shared<const parsing::RegistrySnapshot>(
          std::move(*registry));
    else
      throw std::logic_error(
          "Failed to bootstrap the built-in parser registry.");
  }

  ~Worker() {
    if (const auto sniffer = current_sniffer())
      sniffer->stop();
  }

  std::string handle(std::string_view request) {
    const auto id = field(request, "id");
    const auto op = field(request, "op");
    const auto version = number(request, "v");
    const std::string prefix = "{\"v\":2,\"kind\":\"response\",\"id\":" +
                               json_string(id.value_or("")) + ',';
    if (request.size() < 2 || request.front() != '{' || request.back() != '}' ||
        !id || !op || !version)
      return prefix + "\"ok\":false,\"error\":\"malformed_request\"}";
    if (*version != 2)
      return prefix + "\"ok\":false,\"error\":\"unsupported_version\"}";
    if (*op == "hello")
      return prefix + "\"ok\":true,\"protocolVersion\":2,\"features\":["
                      "\"live\",\"replay\",\"recovery\",\"packetDetail\","
                      "\"framedControl\",\"detailFile\"]}";
    if (*op == "start") {
      const auto token = field(request, "token");
      if (!token || token->empty())
        return prefix + "\"ok\":false,\"error\":\"malformed_request\"}";
      return start(prefix, *token, request);
    }
    if (*op == "startLive")
      return start_live(prefix, request);
    if (*op == "shutdown") {
      if (const auto sniffer = current_sniffer())
        sniffer->stop();
      shutdown_ = true;
      return prefix + "\"ok\":true}";
    }
    if (*op == "interfaces")
      return interfaces(prefix);
    if (*op == "capabilities") {
      const auto name = field(request, "name");
      const auto monitor_mode = boolean_field(request, "monitorMode");
      if (!name || name->empty() || !monitor_mode)
        return prefix + "\"ok\":false,\"error\":\"malformed_request\"}";
      return capabilities(prefix, *name, *monitor_mode);
    }
    if (*op == "registry")
      return registry(prefix);
    if (*op == "recoverSegments")
      return recover_segments(prefix, request);
    if (*op == "detailStored")
      return detail_stored(prefix, request);

    if (const auto error = validate_capture(prefix, request))
      return *error;
    if (*op == "status")
      return status(prefix);
    if (*op == "stop")
      return stop(prefix);
    if (*op == "summaries") {
      const auto cursor = number(request, "cursor");
      const auto limit = number(request, "limit");
      if (!cursor || !limit || *limit == 0 || *limit > kMaxSummaryRead)
        return prefix + "\"ok\":false,\"error\":\"malformed_request\"}";
      return summaries(prefix, *cursor, *limit);
    }
    if (*op == "stats")
      return stats(prefix);
    if (*op == "segments")
      return segments(prefix);
    if (*op == "leaseSnapshot")
      return lease_snapshot(prefix);
    if (*op == "releaseSnapshot")
      return release_snapshot(prefix, request);
    if (*op == "detail")
      return detail(prefix, request);
    if (*op == "events") {
      const auto cursor = number(request, "cursor");
      const auto limit = number(request, "limit");
      if (!cursor || !limit || *limit == 0 || *limit > kMaxEventRead)
        return prefix + "\"ok\":false,\"error\":\"malformed_request\"}";
      return events(prefix, *cursor, *limit);
    }
    return prefix + "\"ok\":false,\"error\":\"unknown_operation\"}";
  }
  bool shutdown() const noexcept { return shutdown_; }

private:
  static std::string boolean(bool value) { return value ? "true" : "false"; }
  enum class State { Stopped, Running, Failed };
  std::shared_ptr<sniffing::NetworkSniffer> current_sniffer() const {
    std::lock_guard lock(session_mutex_);
    return sniffer_;
  }
  parsing::RegistrySnapshotPtr current_registry() const {
    std::lock_guard lock(session_mutex_);
    return registry_;
  }
  void set_sniffer(std::shared_ptr<sniffing::NetworkSniffer> sniffer) {
    std::lock_guard lock(session_mutex_);
    sniffer_ = std::move(sniffer);
  }
  void set_failure(std::string failure) {
    std::lock_guard lock(failure_mutex_);
    fatal_failure_ = std::move(failure);
  }
  std::string current_failure() const {
    std::lock_guard lock(failure_mutex_);
    return fatal_failure_;
  }
  std::optional<std::string> validate_capture(const std::string &prefix,
                                              std::string_view request) const {
    const auto high = number(request, "captureHigh");
    const auto low = number(request, "captureLow");
    if (!high || !low)
      return prefix + "\"ok\":false,\"error\":\"malformed_request\"}";
    const auto sniffer = current_sniffer();
    const auto capture = sniffer ? sniffer->capture_id() : std::nullopt;
    if (!capture || capture->high != *high || capture->low != *low) {
      std::string response =
          prefix + "\"ok\":false,\"error\":\"stale_capture\"";
      if (capture)
        response += ",\"captureHigh\":" + decimal(capture->high) +
                    ",\"captureLow\":" + decimal(capture->low);
      return response + "}";
    }
    return std::nullopt;
  }

  std::string state_name() {
    if (state_.load() == State::Failed) {
      if (const auto sniffer = current_sniffer())
        sniffer->stop();
      return "failed";
    }
    if (state_.load() == State::Stopped)
      return "stopped";
    const auto sniffer = current_sniffer();
    if (sniffer && sniffer->is_running())
      return "running";
    if (sniffer)
      sniffer->stop();
    if (stopped_ns_.load() == 0)
      stopped_ns_ = wall_time_ns();
    return "completed";
  }

  std::string session_json() {
    const auto sniffer = current_sniffer();
    const auto registry = current_registry();
    const auto failure = current_failure();
    const auto capture = sniffer ? sniffer->capture_id() : std::nullopt;
    std::ostringstream out;
    out << "\"captureHigh\":" << decimal(capture ? capture->high : 0)
        << ",\"captureLow\":" << decimal(capture ? capture->low : 0)
        << ",\"state\":" << json_string(state_name())
        << ",\"registryRevision\":"
        << decimal(registry ? registry->revision().value : 0)
        << ",\"startedAtNs\":" << decimal(started_ns_.load())
        << ",\"stoppedAtNs\":";
    if (stopped_ns_.load() == 0)
      out << "null";
    else
      out << decimal(stopped_ns_.load());
    out << ",\"failure\":" << (failure.empty() ? "null" : json_string(failure));
    return out.str();
  }

  std::string status(const std::string &prefix) {
    return prefix + "\"ok\":true," + session_json() + "}";
  }

  std::string stop(const std::string &prefix) {
    if (const auto sniffer = current_sniffer())
      sniffer->stop();
    state_ = State::Stopped;
    stopped_ns_ = wall_time_ns();
    return prefix + "\"ok\":true," + session_json() + "}";
  }

  std::string recover_segments(const std::string &prefix,
                               std::string_view request) {
    const auto high = number(request, "captureHigh");
    const auto low = number(request, "captureLow");
    const auto directory = field(request, "spoolDirectory");
    const auto truncate_partial_tail =
        boolean_field(request, "truncatePartialTail");
    if (!high || !low || (*high == 0 && *low == 0) || !directory ||
        directory->empty() || !truncate_partial_tail)
      return prefix + "\"ok\":false,\"error\":\"malformed_request\"}";
    std::error_code path_error;
    const auto requested = std::filesystem::path(*directory);
    const auto canonical =
        std::filesystem::weakly_canonical(requested, path_error);
    if (!requested.is_absolute() || path_error ||
        canonical != requested.lexically_normal())
      return prefix + "\"ok\":false,\"error\":\"invalid_spool_path\"}";
    std::vector<std::filesystem::path> segments;
    for (std::filesystem::directory_iterator iterator(canonical, path_error),
         end;
         !path_error && iterator != end; iterator.increment(path_error)) {
      if (iterator->is_regular_file(path_error) &&
          iterator->path().extension() == ".pcapng")
        segments.push_back(iterator->path());
    }
    if (path_error)
      return prefix + "\"ok\":false,\"error\":\"recovery_io\"}";
    std::sort(segments.begin(), segments.end());
    const sniffing::CaptureId expected{*high, *low};
    std::ostringstream output;
    output << prefix << "\"ok\":true,\"captureHigh\":" << decimal(*high)
           << ",\"captureLow\":" << decimal(*low) << ",\"segments\":[";
    for (std::size_t index = 0; index < segments.size(); ++index) {
      const auto recovered = capture::PcapngSpool::recover_segment(
          segments[index], *truncate_partial_tail);
      if (const auto *error = std::get_if<capture::SpoolError>(&recovered))
        return prefix + "\"ok\":false,\"error\":\"" +
               capture::to_string(error->reason) +
               "\",\"message\":" + json_string(error->message) + "}";
      const auto &result =
          std::get<capture::PcapngSpool::RecoveryResult>(recovered);
      if (!*truncate_partial_tail && result.truncated_bytes != 0)
        return prefix + "\"ok\":false,\"error\":\"CorruptData\",\"message\":"
                        "\"A finalized segment has an invalid tail.\"}";
      if (result.capture_id != expected)
        return prefix + "\"ok\":false,\"error\":\"capture_identity_mismatch\"}";
      if (index)
        output << ',';
      const auto first = result.packets.empty()
                             ? 0
                             : result.packets.front().metadata.key.packet_id;
      const auto last = result.packets.empty()
                            ? 0
                            : result.packets.back().metadata.key.packet_id;
      const auto stem = segments[index].stem().string();
      const auto separator = stem.rfind('-');
      std::uint64_t generation = 0;
      const auto generation_text =
          separator == std::string::npos
              ? std::string_view{}
              : std::string_view(stem).substr(separator + 1);
      const auto parsed_generation = std::from_chars(
          generation_text.data(),
          generation_text.data() + generation_text.size(), generation);
      if (generation_text.empty() || parsed_generation.ec != std::errc{} ||
          parsed_generation.ptr !=
              generation_text.data() + generation_text.size())
        return prefix + "\"ok\":false,\"error\":\"invalid_segment_name\"}";
      output << "{\"generation\":" << generation
             << ",\"path\":" << json_string(segments[index].string())
             << ",\"committedBytes\":" << decimal(result.valid_bytes)
             << ",\"committedPackets\":" << decimal(result.packets.size())
             << ",\"firstPacketId\":" << decimal(first)
             << ",\"lastPacketId\":" << decimal(last) << ",\"evicted\":false}";
    }
    output << "]}";
    return output.str();
  }
  void reset_capture() {
    if (const auto sniffer = current_sniffer())
      sniffer->stop();
    journal_.clear();
    events_.clear();
    {
      std::lock_guard lock(analyzed_packets_mutex_);
      analyzed_packets_.clear();
      analysis_failed_packets_.clear();
    }
    analysis_callback_errors_ = 0;
    set_failure({});
    state_ = State::Stopped;
    stopped_ns_ = 0;
  }

  void consume_packet(const sniffing::RawPacketView &raw,
                      const sniffing::ParsedPacket &parsed) {
    const auto registry = current_registry();
    if (!registry || !summary_extractor_ ||
        !journal_.append(
            replay::extract_summary(raw, parsed, *summary_extractor_))) {
      {
        std::lock_guard lock(analyzed_packets_mutex_);
        analysis_failed_packets_.insert(raw.metadata.key.packet_id);
      }
      ++analysis_callback_errors_;
      throw std::runtime_error("Unable to append analyzed packet summary.");
    }
    std::lock_guard lock(analyzed_packets_mutex_);
    analyzed_packets_.insert(raw.metadata.key.packet_id);
  }

  void consume_event(const sniffing::SnifferEvent &event) noexcept {
    if (!events_.append(event))
      ++analysis_callback_errors_;
    if (event.severity == sniffing::SnifferSeverity::Fatal) {
      set_failure(sniffing::to_string(event.code) + ": " + event.message);
      state_ = State::Failed;
    }
  }

  std::string start_sniffer(const std::string &prefix) {
    const auto sniffer = current_sniffer();
    const auto registry = sniffer->registry_snapshot();
    {
      std::lock_guard lock(session_mutex_);
      registry_ = registry;
    }
    summary_extractor_ = std::make_unique<parsing::SummaryExtractor>(*registry);
    started_ns_ = wall_time_ns();
    if (const auto error = sniffer->start()) {
      state_ = State::Failed;
      set_failure(sniffing::to_string(error->code) + ": " + error->message);
      stopped_ns_ = wall_time_ns();
      return prefix + "\"ok\":false,\"error\":" +
             json_string(sniffing::to_string(error->code)) +
             ",\"message\":" + json_string(error->message) + ',' +
             session_json() + "}";
    }
    state_ = State::Running;
    return prefix + "\"ok\":true," + session_json() + "}";
  }

  std::string start(const std::string &prefix, const std::string &token,
                    std::string_view request) {
    const auto path = paths_.find(token);
    if (path == paths_.end())
      return prefix + "\"ok\":false,\"error\":\"unknown_path_token\"}";
    reset_capture();
    sniffing::SnifferOptions options;
    const auto capture_high = number(request, "captureHigh");
    const auto capture_low = number(request, "captureLow");
    const auto spool_directory = field(request, "spoolDirectory");
    if (capture_high || capture_low || spool_directory) {
      if (!capture_high || !capture_low ||
          (*capture_high == 0 && *capture_low == 0) || !spool_directory ||
          spool_directory->empty())
        return prefix + "\"ok\":false,\"error\":\"invalid_spool_path\"}";
      std::error_code spool_path_error;
      const auto requested_spool_path = std::filesystem::path(*spool_directory);
      const auto canonical_spool_path = std::filesystem::weakly_canonical(
          requested_spool_path, spool_path_error);
      if (!requested_spool_path.is_absolute() || spool_path_error ||
          canonical_spool_path != requested_spool_path.lexically_normal())
        return prefix + "\"ok\":false,\"error\":\"invalid_spool_path\"}";
      options.capture_id = sniffing::CaptureId{*capture_high, *capture_low};
      options.spool_directory = canonical_spool_path.string();
      options.spool_temporary = false;
    }
    options.interfaces.emplace_back();
    options.interfaces.front().ring_slots = 1024;
    options.interfaces.front().pcap_dispatch_batch_size = 64;
    set_sniffer(std::make_shared<sniffing::NetworkSniffer>(
        sniffing::NetworkSniffer::offline(
            path->second, std::move(options),
            [this](const auto &raw, const auto &parsed) {
              consume_packet(raw, parsed);
            },
            [this](const sniffing::SnifferEvent &event) noexcept {
              consume_event(event);
            })));
    return start_sniffer(prefix);
  }

  std::string start_live(const std::string &prefix, std::string_view request) {
    const auto capture_high = number(request, "captureHigh");
    const auto capture_low = number(request, "captureLow");
    const auto spool_directory = field(request, "spoolDirectory");
    const auto interface_count = number(request, "interfaceCount");
    const auto snaplen = number(request, "snaplen");
    const auto pcap_buffer = number(request, "pcapBufferSizeBytes");
    const auto read_timeout = number(request, "readTimeoutMs");
    const auto dispatch_batch = number(request, "dispatchBatchSize");
    const auto ring_slots = number(request, "ringSlots");
    const auto ring_bytes = number(request, "ringBytes");
    const auto max_ring_bytes = number(request, "maxTotalRingBytes");
    const auto spool_max_bytes = number(request, "spoolMaxTotalBytes");
    const auto spool_segment_bytes = number(request, "spoolSegmentBytes");
    const auto spool_max_segments = number(request, "spoolMaxSegments");
    const auto spool_ring_mode = boolean_field(request, "spoolRingMode");
    const auto spool_temporary = boolean_field(request, "spoolTemporary");
    const auto bpf_filter = field(request, "bpfFilter");
    if (!capture_high || !capture_low ||
        (*capture_high == 0 && *capture_low == 0) || !spool_directory ||
        spool_directory->empty() || !interface_count || *interface_count == 0 ||
        *interface_count > 256 || !snaplen || !pcap_buffer || !read_timeout ||
        !dispatch_batch || !ring_slots || !ring_bytes || !max_ring_bytes ||
        !spool_max_bytes || !spool_segment_bytes || !spool_max_segments ||
        !spool_ring_mode || !spool_temporary || !bpf_filter ||
        *snaplen >
            static_cast<std::uint64_t>(std::numeric_limits<int>::max()) ||
        *pcap_buffer >
            static_cast<std::uint64_t>(std::numeric_limits<int>::max()) ||
        *read_timeout >
            static_cast<std::uint64_t>(std::numeric_limits<int>::max()) ||
        *dispatch_batch >
            static_cast<std::uint64_t>(std::numeric_limits<int>::max()))
      return prefix + "\"ok\":false,\"error\":\"malformed_request\"}";

    sniffing::SnifferOptions options;
    std::error_code spool_path_error;
    const auto requested_spool_path = std::filesystem::path(*spool_directory);
    if (!requested_spool_path.is_absolute())
      return prefix + "\"ok\":false,\"error\":\"invalid_spool_path\"}";
    const auto canonical_spool_path = std::filesystem::weakly_canonical(
        requested_spool_path, spool_path_error);
    if (spool_path_error ||
        canonical_spool_path != requested_spool_path.lexically_normal())
      return prefix + "\"ok\":false,\"error\":\"invalid_spool_path\"}";
    options.capture_id = sniffing::CaptureId{*capture_high, *capture_low};
    options.spool_directory = canonical_spool_path.string();
    options.max_total_ring_bytes = static_cast<std::size_t>(*max_ring_bytes);
    options.spool_max_total_bytes = *spool_max_bytes;
    options.spool_segment_bytes = *spool_segment_bytes;
    options.spool_max_segments = static_cast<std::size_t>(*spool_max_segments);
    options.spool_ring_mode = *spool_ring_mode;
    options.spool_temporary = false;
    options.interfaces.reserve(static_cast<std::size_t>(*interface_count));
    for (std::uint64_t index = 0; index < *interface_count; ++index) {
      const auto key = std::to_string(index);
      const auto name = field(request, "interface" + key + "Name");
      const auto promiscuous =
          boolean_field(request, "interface" + key + "Promiscuous");
      const auto monitor =
          boolean_field(request, "interface" + key + "MonitorMode");
      const auto link_type = number(request, "interface" + key + "LinkType");
      const auto timestamp_type =
          field(request, "interface" + key + "TimestampType");
      if (!name || name->empty() || !promiscuous || !monitor || !link_type ||
          !timestamp_type)
        return prefix + "\"ok\":false,\"error\":\"malformed_request\"}";

      sniffing::SnifferInterfaceOptions interface_options;
      interface_options.name = *name;
      interface_options.id = static_cast<std::uint32_t>(index);
      interface_options.promiscuous = *promiscuous;
      interface_options.monitor_mode = *monitor;
      interface_options.snaplen = static_cast<int>(*snaplen);
      interface_options.pcap_buffer_size_bytes = static_cast<int>(*pcap_buffer);
      interface_options.read_timeout_ms = static_cast<int>(*read_timeout);
      interface_options.pcap_dispatch_batch_size =
          static_cast<int>(*dispatch_batch);
      interface_options.ring_slots = static_cast<std::size_t>(*ring_slots);
      interface_options.ring_bytes = static_cast<std::size_t>(*ring_bytes);
      interface_options.bpf_filter = *bpf_filter;
      if (*link_type != 0)
        interface_options.requested_link_type =
            static_cast<int>(*link_type - 1);
      if (!timestamp_type->empty())
        interface_options.timestamp_type = *timestamp_type;
      options.interfaces.push_back(std::move(interface_options));
    }

    reset_capture();
    set_sniffer(std::make_shared<sniffing::NetworkSniffer>(
        std::move(options),
        [this](const auto &raw, const auto &parsed) {
          consume_packet(raw, parsed);
        },
        [this](const sniffing::SnifferEvent &event) noexcept {
          consume_event(event);
        }));
    return start_sniffer(prefix);
  }
  std::string summaries(const std::string &prefix, std::uint64_t cursor,
                        std::uint64_t requested) {
    const auto read = journal_.read(
        cursor, std::min<std::uint64_t>(requested, kMaxSummaryRead));
    std::ostringstream out;
    const auto capture = current_sniffer()->capture_id();
    out << prefix << "\"ok\":true,\"captureHigh\":" << decimal(capture->high)
        << ",\"captureLow\":" << decimal(capture->low)
        << ",\"oldestAvailableCursor\":";
    if (read.oldest_cursor)
      out << decimal(*read.oldest_cursor);
    else
      out << "null";
    out << ",\"newestAvailableCursor\":";
    if (read.newest_cursor)
      out << decimal(*read.newest_cursor);
    else
      out << "null";
    out << ",\"firstCursor\":";
    if (!read.entries.empty())
      out << decimal(read.entries.front().cursor);
    else
      out << "null";
    out << ",\"lastCursor\":";
    if (!read.entries.empty())
      out << decimal(read.entries.back().cursor);
    else
      out << "null";
    const auto state = state_name();
    const auto capture_complete =
        state == "completed" || state == "stopped" || state == "failed";
    out << ",\"gapBeforeFirst\":" << boolean(read.cursor_evicted)
        << ",\"captureComplete\":" << boolean(capture_complete)
        << ",\"summaries\":[";
    for (std::size_t i = 0; i < read.entries.size(); ++i) {
      const auto &e = read.entries[i];
      if (i)
        out << ',';
      out << "{\"cursor\":" << decimal(e.cursor)
          << ",\"captureHigh\":" << decimal(e.metadata.key.capture_id.high)
          << ",\"captureLow\":" << decimal(e.metadata.key.capture_id.low)
          << ",\"packetId\":" << decimal(e.metadata.key.packet_id)
          << ",\"timestampNs\":" << decimal(e.metadata.timestamp_ns)
          << ",\"interfaceId\":" << e.metadata.interface_id
          << ",\"capturedLength\":" << e.metadata.captured_len
          << ",\"wireLength\":" << e.metadata.wire_len
          << ",\"linkType\":" << e.metadata.link_type
          << ",\"captureFlags\":" << e.metadata.flags
          << ",\"parseCondition\":" << json_string(parse_condition(e.condition))
          << ",\"registryRevision\":" << decimal(e.registry_revision.value)
          << ",\"analysisRevision\":" << decimal(e.registry_revision.value)
          << ",\"protocolPath\":[";
      for (std::size_t path_index = 0; path_index < e.protocol_path.size();
           ++path_index) {
        if (path_index)
          out << ',';
        out << e.protocol_path[path_index].value;
      }
      out << "],\"columns\":["
          << "{\"key\":\"source\",\"value\":" << json_string(e.source)
          << "},{\"key\":\"destination\",\"value\":"
          << json_string(e.destination)
          << "},{\"key\":\"protocol\",\"value\":" << json_string(e.protocol)
          << "},{\"key\":\"length\",\"value\":" << json_string(e.length)
          << "},{\"key\":\"info\",\"value\":" << json_string(e.info) << "}]}";
    }
    out << "]}";
    return out.str();
  }
  std::string stats(const std::string &prefix) {
    const auto sniffer = current_sniffer();
    const auto capture =
        sniffer ? sniffer->stats() : sniffing::SnifferStatsSnapshot{};
    const auto id = sniffer ? sniffer->capture_id() : std::nullopt;
    const auto summaries = journal_.read(0, 1);
    const auto now = std::chrono::steady_clock::now();
    std::uint64_t write_rate = 0;
    if (last_stats_at_.time_since_epoch().count() != 0 &&
        capture.spool_bytes_written >= last_stats_bytes_) {
      const auto elapsed =
          std::chrono::duration<double>(now - last_stats_at_).count();
      if (elapsed > 0)
        write_rate = static_cast<std::uint64_t>(
            (capture.spool_bytes_written - last_stats_bytes_) / elapsed);
    }
    last_stats_at_ = now;
    last_stats_bytes_ = capture.spool_bytes_written;
    std::ostringstream out;
    out << prefix
        << "\"ok\":true,\"captureHigh\":" << decimal(id ? id->high : 0)
        << ",\"captureLow\":" << decimal(id ? id->low : 0)
        << ",\"packetsObserved\":" << decimal(capture.packets_observed)
        << ",\"captureQueueAccepted\":"
        << decimal(capture.capture_queue_accepted)
        << ",\"captureQueueFullDrops\":"
        << decimal(capture.capture_queue_full_drops)
        << ",\"captureQueueOversizeDrops\":"
        << decimal(capture.capture_queue_oversize_drops)
        << ",\"invalidCallbackDrops\":"
        << decimal(capture.invalid_callback_drops)
        << ",\"pcapDispatchCalls\":" << decimal(capture.pcap_dispatch_calls)
        << ",\"pcapDispatchErrors\":" << decimal(capture.pcap_dispatch_errors)
        << ",\"pcapStatsReadFailures\":"
        << decimal(capture.pcap_stats_read_failures)
        << ",\"pcapReceived\":" << decimal(capture.pcap_received)
        << ",\"pcapKernelDrops\":" << decimal(capture.pcap_kernel_drops)
        << ",\"pcapInterfaceDrops\":" << decimal(capture.pcap_interface_drops)
        << ",\"captureQueueDepth\":" << decimal(capture.capture_queue_depth)
        << ",\"captureQueueCapacityPackets\":"
        << decimal(capture.capture_queue_capacity_packets)
        << ",\"captureQueueCapacityBytes\":"
        << decimal(capture.capture_queue_capacity_bytes)
        << ",\"captureQueueBytes\":" << decimal(capture.capture_queue_bytes)
        << ",\"captureQueueMaxDepth\":"
        << decimal(capture.capture_queue_max_depth)
        << ",\"captureQueueMaxBytes\":"
        << decimal(capture.capture_queue_max_bytes)
        << ",\"packetsPersisted\":" << decimal(capture.packets_persisted)
        << ",\"spoolBytesWritten\":" << decimal(capture.spool_bytes_written)
        << ",\"spoolWriteRate\":" << decimal(write_rate)
        << ",\"spoolSegments\":" << decimal(capture.spool_segments)
        << ",\"spoolQuotaBytes\":" << decimal(capture.spool_quota_bytes)
        << ",\"spoolBytesRetained\":" << decimal(capture.spool_bytes_retained)
        << ",\"spoolEvictedPackets\":" << decimal(capture.spool_evicted_packets)
        << ",\"spoolEvictedBytes\":" << decimal(capture.spool_evicted_bytes)
        << ",\"spoolWriteFailures\":" << decimal(capture.spool_write_failures)
        << ",\"spoolFlushFailures\":" << decimal(capture.spool_flush_failures)
        << ",\"lastCommittedPacketId\":"
        << decimal(capture.last_committed_packet_id)
        << ",\"writerInFlight\":" << decimal(capture.writer_in_flight)
        << ",\"terminalWriteLosses\":" << decimal(capture.terminal_write_losses)
        << ",\"packetsAvailableForAnalysis\":"
        << decimal(capture.packets_available_for_analysis)
        << ",\"packetsAnalyzed\":" << decimal(capture.packets_analyzed)
        << ",\"analysisBacklogPackets\":"
        << decimal(capture.analysis_backlog_packets)
        << ",\"analysisBacklogBytes\":"
        << decimal(capture.analysis_backlog_bytes) << ",\"analysisErrors\":"
        << decimal(capture.analysis_errors + analysis_callback_errors_.load())
        << ",\"analysisResourceLimits\":"
        << decimal(capture.analysis_resource_limits)
        << ",\"summaryCount\":" << decimal(journal_.size())
        << ",\"summaryOldestCursor\":"
        << (summaries.oldest_cursor ? decimal(*summaries.oldest_cursor)
                                    : "null")
        << ",\"summaryNewestCursor\":"
        << (summaries.newest_cursor ? decimal(*summaries.newest_cursor)
                                    : "null")
        << ",\"analysisGapCount\":" << decimal(capture.analysis_gap_count)
        << ",\"analysisEvictedBeforeAnalysis\":"
        << decimal(capture.analysis_evicted_before_analysis)
        << ",\"analysisRejects\":" << decimal(capture.analysis_rejects)
        << ",\"writerRunning\":" << boolean(capture.writer_thread_running)
        << ",\"analyzerRunning\":" << boolean(capture.analyzer_running)
        << ",\"interfaces\":[";
    for (std::size_t index = 0; index < capture.interfaces.size(); ++index) {
      const auto &item = capture.interfaces[index];
      if (index)
        out << ',';
      out << "{\"interfaceId\":" << item.interface_id
          << ",\"interfaceName\":" << json_string(item.interface_name)
          << ",\"linkType\":" << item.link_type
          << ",\"packetsObserved\":" << decimal(item.packets_observed)
          << ",\"captureQueueAccepted\":"
          << decimal(item.capture_queue_accepted)
          << ",\"captureQueueFullDrops\":"
          << decimal(item.capture_queue_full_drops)
          << ",\"captureQueueOversizeDrops\":"
          << decimal(item.capture_queue_oversize_drops)
          << ",\"invalidCallbackDrops\":"
          << decimal(item.invalid_callback_drops)
          << ",\"pcapDispatchCalls\":" << decimal(item.pcap_dispatch_calls)
          << ",\"pcapDispatchErrors\":" << decimal(item.pcap_dispatch_errors)
          << ",\"pcapStatsReadFailures\":"
          << decimal(item.pcap_stats_read_failures)
          << ",\"pcapReceived\":" << decimal(item.pcap_received)
          << ",\"pcapKernelDrops\":" << decimal(item.pcap_kernel_drops)
          << ",\"pcapInterfaceDrops\":" << decimal(item.pcap_interface_drops)
          << ",\"captureQueueDepth\":" << decimal(item.capture_queue_depth)
          << ",\"captureQueueCapacityPackets\":"
          << decimal(item.capture_queue_capacity_packets)
          << ",\"captureQueueCapacityBytes\":"
          << decimal(item.capture_queue_capacity_bytes)
          << ",\"captureQueueBytes\":" << decimal(item.capture_queue_bytes)
          << ",\"captureQueueMaxDepth\":"
          << decimal(item.capture_queue_max_depth)
          << ",\"captureQueueMaxBytes\":"
          << decimal(item.capture_queue_max_bytes)
          << ",\"captureThreadRunning\":"
          << boolean(item.capture_thread_running) << '}';
    }
    out << "]}";
    return out.str();
  }
  std::string registry(const std::string &prefix) {
    const auto registry = current_registry();
    if (!registry)
      return prefix + "\"ok\":false,\"error\":\"not_started\"}";
    std::ostringstream out;
    out << prefix << "\"ok\":true,\"registryRevision\":"
        << decimal(registry->revision().value) << ",\"protocols\":[";
    for (std::size_t i = 0; i < registry->protocols().size(); ++i) {
      const auto &p = registry->protocols()[i];
      if (i)
        out << ',';
      out << "{\"id\":" << p.id.value << ",\"key\":" << json_string(p.key)
          << ",\"displayName\":" << json_string(p.display_name)
          << ",\"visibilityFlags\":" << p.visibility_flags << '}';
    }
    out << "],\"fields\":[";
    for (std::size_t i = 0; i < registry->fields().size(); ++i) {
      const auto &f = registry->fields()[i];
      if (i)
        out << ',';
      out << "{\"id\":" << f.id.value
          << ",\"protocolId\":" << f.protocol_id.value
          << ",\"key\":" << json_string(f.key)
          << ",\"displayName\":" << json_string(f.display_name)
          << ",\"valueType\":" << json_string(value_type(f.value_type))
          << ",\"visibilityFlags\":" << f.visibility_flags << '}';
    }
    out << "]}";
    return out.str();
  }
  std::string segments(const std::string &prefix) {
    const auto sniffer = current_sniffer();
    const auto capture = sniffer ? sniffer->capture_id() : std::nullopt;
    std::ostringstream out;
    out << prefix << "\"ok\":true,\"captureHigh\":"
        << decimal(capture ? capture->high : 0)
        << ",\"captureLow\":" << decimal(capture ? capture->low : 0)
        << ",\"segments\":[";
    const auto snapshots = sniffer
                               ? sniffer->spool_segments()
                               : std::vector<capture::PcapngSegmentSnapshot>{};
    for (std::size_t index = 0; index < snapshots.size(); ++index) {
      if (index)
        out << ',';
      const auto &segment = snapshots[index];
      out << "{\"generation\":" << segment.id
          << ",\"path\":" << json_string(segment.path.string())
          << ",\"committedBytes\":" << decimal(segment.committed_bytes)
          << ",\"committedPackets\":" << decimal(segment.committed_packets)
          << ",\"firstPacketId\":" << decimal(segment.first_packet_id)
          << ",\"lastPacketId\":" << decimal(segment.last_packet_id)
          << ",\"evicted\":" << boolean(segment.evicted) << '}';
    }
    out << "]}";
    return out.str();
  }
  std::string lease_snapshot(const std::string &prefix) {
    const auto sniffer = current_sniffer();
    if (!sniffer)
      return prefix + "\"ok\":false,\"error\":\"not_started\"}";
    const auto snapshots = sniffer->lease_spool_snapshot();
    const auto token = "segment-lease-" +
                       std::to_string(segment_lease_sequence_.fetch_add(1) + 1);
    std::vector<std::uint64_t> generations;
    generations.reserve(snapshots.size());
    for (const auto &segment : snapshots)
      generations.push_back(segment.id);
    segment_leases_.insert_or_assign(token, std::move(generations));
    const auto capture = sniffer->capture_id();
    std::ostringstream out;
    out << prefix << "\"ok\":true,\"captureHigh\":"
        << decimal(capture ? capture->high : 0)
        << ",\"captureLow\":" << decimal(capture ? capture->low : 0)
        << ",\"leaseToken\":" << json_string(token) << ",\"segments\":[";
    for (std::size_t index = 0; index < snapshots.size(); ++index) {
      if (index)
        out << ',';
      const auto &segment = snapshots[index];
      out << "{\"generation\":" << segment.id
          << ",\"path\":" << json_string(segment.path.string())
          << ",\"committedBytes\":" << decimal(segment.committed_bytes)
          << ",\"committedPackets\":" << decimal(segment.committed_packets)
          << ",\"firstPacketId\":" << decimal(segment.first_packet_id)
          << ",\"lastPacketId\":" << decimal(segment.last_packet_id)
          << ",\"evicted\":false}";
    }
    out << "]}";
    return out.str();
  }
  std::string release_snapshot(const std::string &prefix,
                               std::string_view request) {
    const auto token = field(request, "leaseToken");
    if (!token || token->empty())
      return prefix + "\"ok\":false,\"error\":\"malformed_request\"}";
    const auto lease = segment_leases_.find(*token);
    if (lease != segment_leases_.end()) {
      if (const auto sniffer = current_sniffer())
        sniffer->release_spool_leases(lease->second);
      segment_leases_.erase(lease);
    }
    return prefix + "\"ok\":true}";
  }
  std::string detail(const std::string &prefix, std::string_view request) {
    const auto high = number(request, "captureHigh");
    const auto low = number(request, "captureLow");
    const auto packet_id = number(request, "packetId");
    const auto registry_revision = number(request, "registryRevision");
    const auto analysis_revision = number(request, "analysisRevision");
    if (!high || !low || !packet_id || !registry_revision || !analysis_revision)
      return prefix + "\"ok\":false,\"error\":\"malformed_request\"}";
    const sniffing::PacketKey key{{*high, *low}, *packet_id};
    const std::string identity = ",\"captureHigh\":" + decimal(*high) +
                                 ",\"captureLow\":" + decimal(*low);
    const auto sniffer = current_sniffer();
    const auto registry = current_registry();
    if (!sniffer)
      return prefix + "\"ok\":false,\"error\":\"stale_capture\"" + identity +
             "}";
    const auto lookup = sniffer->persisted_packet(key);
    if (lookup.status != capture::PacketSpoolLookupStatus::Found)
      return prefix + "\"ok\":false,\"error\":\"" +
             (lookup.status == capture::PacketSpoolLookupStatus::Evicted
                  ? "evicted"
              : lookup.status == capture::PacketSpoolLookupStatus::Corrupt
                  ? "corrupt_packet"
                  : "not_found") +
             "\"" + identity + "}";
    if (!registry || *registry_revision != registry->revision().value ||
        *analysis_revision != registry->revision().value)
      return prefix + "\"ok\":false,\"error\":\"revision_mismatch\"" +
             identity + "}";
    {
      std::lock_guard lock(analyzed_packets_mutex_);
      if (analysis_failed_packets_.contains(*packet_id))
        return prefix + "\"ok\":false,\"error\":\"analysis_failed\"" +
               identity + "}";
      if (!analyzed_packets_.contains(*packet_id))
        return prefix + "\"ok\":false,\"error\":\"detail_pending\"" + identity +
               "}";
    }
    const auto spool_paths = sniffer->spool_paths();
    if (spool_paths.empty())
      return prefix + "\"ok\":false,\"error\":\"detail_failed\"" + identity +
             "}";
    const auto &retained = *lookup.packet;
    return encode_detail(prefix, identity, retained.metadata, retained.bytes,
                         spool_paths.front().parent_path(), registry);
  }
  std::string detail_stored(const std::string &prefix,
                            std::string_view request) {
    const auto high = number(request, "captureHigh");
    const auto low = number(request, "captureLow");
    const auto packet_id = number(request, "packetId");
    const auto registry_revision = number(request, "registryRevision");
    const auto analysis_revision = number(request, "analysisRevision");
    const auto directory = field(request, "spoolDirectory");
    if (!high || !low || !packet_id || !registry_revision ||
        !analysis_revision || !directory || directory->empty())
      return prefix + "\"ok\":false,\"error\":\"malformed_request\"}";
    const std::string identity = ",\"captureHigh\":" + decimal(*high) +
                                 ",\"captureLow\":" + decimal(*low);
    const auto registry = current_registry();
    if (!registry || *registry_revision != registry->revision().value ||
        *analysis_revision != registry->revision().value)
      return prefix + "\"ok\":false,\"error\":\"revision_mismatch\"" +
             identity + "}";

    std::error_code path_error;
    const auto requested = std::filesystem::path(*directory);
    const auto canonical =
        std::filesystem::weakly_canonical(requested, path_error);
    if (!requested.is_absolute() || path_error ||
        canonical != requested.lexically_normal())
      return prefix + "\"ok\":false,\"error\":\"invalid_spool_path\"" +
             identity + "}";

    std::vector<std::filesystem::path> segments;
    for (std::filesystem::directory_iterator iterator(canonical, path_error),
         end;
         !path_error && iterator != end; iterator.increment(path_error)) {
      if (iterator->is_regular_file(path_error) &&
          iterator->path().extension() == ".pcapng")
        segments.push_back(iterator->path());
    }
    if (path_error)
      return prefix + "\"ok\":false,\"error\":\"corrupt_packet\"" + identity +
             "}";
    std::sort(segments.begin(), segments.end());
    const sniffing::CaptureId expected{*high, *low};
    for (const auto &path : segments) {
      const auto recovered = capture::PcapngSpool::recover_segment(path, false);
      const auto *result =
          std::get_if<capture::PcapngSpool::RecoveryResult>(&recovered);
      if (!result || result->capture_id != expected ||
          result->truncated_bytes != 0)
        return prefix + "\"ok\":false,\"error\":\"corrupt_packet\"" + identity +
               "}";
      const auto packet =
          std::find_if(result->packets.begin(), result->packets.end(),
                       [&](const capture::CommittedPacket &candidate) {
                         return candidate.metadata.key.packet_id == *packet_id;
                       });
      if (packet == result->packets.end())
        continue;
      if (packet->data_offset > result->valid_bytes ||
          packet->metadata.captured_len >
              result->valid_bytes - packet->data_offset)
        return prefix + "\"ok\":false,\"error\":\"corrupt_packet\"" + identity +
               "}";
      std::vector<std::byte> bytes(packet->metadata.captured_len);
      std::ifstream input(path, std::ios::binary);
      input.seekg(static_cast<std::streamoff>(packet->data_offset));
      input.read(reinterpret_cast<char *>(bytes.data()),
                 static_cast<std::streamsize>(bytes.size()));
      if (!input ||
          input.gcount() != static_cast<std::streamsize>(bytes.size()))
        return prefix + "\"ok\":false,\"error\":\"corrupt_packet\"" + identity +
               "}";
      return encode_detail(prefix, identity, packet->metadata, bytes, canonical,
                           registry);
    }
    return prefix + "\"ok\":false,\"error\":\"not_found\"" + identity + "}";
  }
  std::string encode_detail(const std::string &prefix,
                            const std::string &identity,
                            const sniffing::PacketMetadata &metadata,
                            std::span<const std::byte> packet_bytes,
                            const std::filesystem::path &directory,
                            const parsing::RegistrySnapshotPtr &registry) {
    try {
      parsing::internal::PacketParser parser(registry);
      const sniffing::RawPacketView view{metadata, packet_bytes};
      auto tree = parser.parse(view);
      parsing::PacketTreeEncoder encoder;
      const auto encoded = encoder.encode(tree);
      const auto *bytes = std::get_if<std::span<const std::byte>>(&encoded);
      if (!bytes)
        return prefix + "\"ok\":false,\"error\":\"encode_failed\"" + identity +
               "}";
      const auto detail_path =
          directory /
          ("detail-" + std::to_string(metadata.key.capture_id.high) + "-" +
           std::to_string(metadata.key.capture_id.low) + "-" +
           std::to_string(metadata.key.packet_id) + "-" +
           std::to_string(detail_sequence_.fetch_add(1) + 1) + ".prt2");
      std::ofstream output(detail_path, std::ios::binary | std::ios::trunc);
      output.write(reinterpret_cast<const char *>(bytes->data()),
                   static_cast<std::streamsize>(bytes->size()));
      output.close();
      if (!output)
        return prefix + "\"ok\":false,\"error\":\"detail_failed\"" + identity +
               "}";
      return prefix + "\"ok\":true" + identity +
             ",\"format\":\"PRT2\",\"dataPath\":" +
             json_string(detail_path.string()) +
             ",\"byteLength\":" + decimal(bytes->size()) +
             ",\"registryRevision\":" + decimal(registry->revision().value) +
             ",\"analysisRevision\":" + decimal(registry->revision().value) +
             "}";
    } catch (...) {
      return prefix + "\"ok\":false,\"error\":\"detail_failed\"" + identity +
             "}";
    }
  }
  std::string events(const std::string &prefix, std::uint64_t cursor,
                     std::uint64_t requested) {
    const auto read =
        events_.read(cursor, std::min<std::uint64_t>(requested, kMaxEventRead));
    const auto capture = current_sniffer()->capture_id();
    std::ostringstream out;
    out << prefix << "\"ok\":true,\"captureHigh\":" << decimal(capture->high)
        << ",\"captureLow\":" << decimal(capture->low)
        << ",\"gapBeforeFirst\":" << boolean(read.cursor_evicted)
        << ",\"oldestAvailableCursor\":";
    if (read.oldest_cursor)
      out << decimal(*read.oldest_cursor);
    else
      out << "null";
    out << ",\"newestAvailableCursor\":";
    if (read.newest_cursor)
      out << decimal(*read.newest_cursor);
    else
      out << "null";
    out << ",\"events\":[";
    for (std::size_t index = 0; index < read.entries.size(); ++index) {
      const auto &item = read.entries[index];
      if (index)
        out << ',';
      out << "{\"cursor\":" << decimal(item.cursor)
          << ",\"timestampNs\":" << decimal(item.event.timestamp_ns)
          << ",\"severity\":"
          << json_string(sniffing::to_string(item.event.severity))
          << ",\"code\":" << json_string(sniffing::to_string(item.event.code))
          << ",\"message\":" << json_string(item.event.message)
          << ",\"recoverable\":" << boolean(item.event.recoverable)
          << ",\"interfaceId\":";
      if (item.event.interface_name.empty())
        out << "null";
      else
        out << item.event.interface_id;
      out << '}';
    }
    out << "]}";
    return out.str();
  }
  std::string interfaces(const std::string &prefix) {
    const auto result = sniffing::list_capture_interfaces();
    if (const auto *error = std::get_if<sniffing::SnifferError>(&result))
      return prefix + "\"ok\":false,\"error\":" + json_string(error->message) +
             "}";
    std::ostringstream out;
    out << prefix << "\"ok\":true,\"interfaces\":[";
    const auto &values =
        std::get<std::vector<sniffing::CaptureInterfaceDescriptor>>(result);
    for (std::size_t index = 0; index < values.size(); ++index) {
      const auto &item = values[index];
      if (index)
        out << ',';
      out << "{\"name\":" << json_string(item.name)
          << ",\"description\":" << json_string(item.description)
          << ",\"addresses\":[";
      for (std::size_t address_index = 0; address_index < item.addresses.size();
           ++address_index) {
        if (address_index)
          out << ',';
        const auto &address = item.addresses[address_index];
        out << "{\"family\":"
            << json_string(address.family ==
                                   sniffing::CaptureInterfaceAddressFamily::IPv4
                               ? "IPv4"
                               : "IPv6")
            << ",\"address\":" << json_string(address.address) << '}';
      }
      out << ']' << ",\"isLoopback\":" << boolean(item.is_loopback)
          << ",\"isUp\":" << boolean(item.is_up)
          << ",\"isRunning\":" << boolean(item.is_running)
          << ",\"isWireless\":" << boolean(item.is_wireless) << '}';
    }
    out << "]}";
    return out.str();
  }
  std::string capabilities(const std::string &prefix, const std::string &name,
                           bool monitor_mode) {
    const auto result =
        sniffing::read_interface_capabilities(name, monitor_mode);
    if (const auto *error = std::get_if<sniffing::SnifferError>(&result))
      return prefix + "\"ok\":false,\"error\":" + json_string(error->message) +
             "}";
    const auto &value =
        std::get<sniffing::CaptureInterfaceCapabilities>(result);
    const auto supported_values = sniffing::default_supported_link_types();
    std::ostringstream out;
    out << prefix << "\"ok\":true,\"name\":" << json_string(value.name)
        << ",\"canSetMonitorMode\":" << boolean(value.can_set_monitor_mode)
        << ",\"linkTypes\":[";
    for (std::size_t index = 0; index < value.link_types.size(); ++index) {
      const auto &item = value.link_types[index];
      if (index)
        out << ',';
      out << "{\"value\":" << item.value
          << ",\"name\":" << json_string(item.name)
          << ",\"description\":" << json_string(item.description)
          << ",\"isDefault\":" << boolean(item.is_default)
          << ",\"parserSupported\":"
          << boolean(std::find(supported_values.begin(), supported_values.end(),
                               item.value) != supported_values.end())
          << '}';
    }
    out << "],\"timestampTypes\":[";
    for (std::size_t index = 0; index < value.timestamp_types.size(); ++index) {
      const auto &item = value.timestamp_types[index];
      if (index)
        out << ',';
      out << "{\"value\":" << item.value
          << ",\"name\":" << json_string(item.name)
          << ",\"description\":" << json_string(item.description) << '}';
    }
    out << "],\"warnings\":[";
    for (std::size_t index = 0; index < value.warnings.size(); ++index) {
      if (index)
        out << ',';
      out << json_string(value.warnings[index].message);
    }
    out << "]}";
    return out.str();
  }
  std::unordered_map<std::string, std::string> paths_;
  replay::SummaryJournal journal_;
  replay::EventJournal events_;
  mutable std::mutex session_mutex_;
  std::shared_ptr<sniffing::NetworkSniffer> sniffer_;
  parsing::RegistrySnapshotPtr registry_;
  std::unique_ptr<parsing::SummaryExtractor> summary_extractor_;
  std::atomic<std::uint64_t> analysis_callback_errors_{0};
  std::mutex analyzed_packets_mutex_;
  std::unordered_set<std::uint64_t> analyzed_packets_;
  std::unordered_set<std::uint64_t> analysis_failed_packets_;
  std::atomic<std::uint64_t> detail_sequence_{0};
  std::atomic<std::uint64_t> segment_lease_sequence_{0};
  std::unordered_map<std::string, std::vector<std::uint64_t>> segment_leases_;
  std::uint64_t last_stats_bytes_ = 0;
  std::chrono::steady_clock::time_point last_stats_at_{};
  mutable std::mutex failure_mutex_;
  std::string fatal_failure_;
  std::atomic<std::uint64_t> started_ns_{0};
  std::atomic<std::uint64_t> stopped_ns_{0};
  std::atomic<State> state_{State::Stopped};
  bool shutdown_ = false;
};
} // namespace

int main(int argc, char **argv) {
#ifdef _WIN32
  _setmode(_fileno(stdin), _O_BINARY);
  _setmode(_fileno(stdout), _O_BINARY);
#endif
  std::unordered_map<std::string, std::string> paths;
  for (int i = 1; i < argc; ++i) {
    std::string_view arg(argv[i]);
    constexpr std::string_view prefix = "--allow=";
    if (!arg.starts_with(prefix))
      continue;
    const auto mapping = arg.substr(prefix.size());
    const auto separator = mapping.find('=');
    if (separator != std::string_view::npos)
      paths.emplace(mapping.substr(0, separator),
                    mapping.substr(separator + 1));
  }
  Worker worker(std::move(paths));
  std::mutex output_mutex;
  const auto respond = [&](std::string response) {
    std::lock_guard lock(output_mutex);
    write_frame(std::cout, response);
  };
  std::mutex detail_mutex;
  std::condition_variable detail_ready;
  std::deque<std::string> detail_requests;
  bool detail_input_closed = false;
  std::jthread detail_executor([&] {
    while (true) {
      std::string request;
      {
        std::unique_lock lock(detail_mutex);
        detail_ready.wait(lock, [&] {
          return detail_input_closed || !detail_requests.empty();
        });
        if (detail_requests.empty()) {
          if (detail_input_closed)
            return;
          continue;
        }
        request = std::move(detail_requests.front());
        detail_requests.pop_front();
      }
      respond(worker.handle(request));
    }
  });
  std::string payload;
  while (true) {
    const auto frame_result = read_frame(std::cin, payload);
    if (frame_result == FrameRead::End || frame_result == FrameRead::Truncated)
      break;
    if (frame_result == FrameRead::TooLarge)
      respond("{\"v\":2,\"kind\":\"response\",\"id\":\"\",\"ok\":false,"
              "\"error\":\"request_too_large\"}");
    else if (const auto op = field(payload, "op");
             op == "detail" || op == "detailStored") {
      bool queued = false;
      {
        std::lock_guard lock(detail_mutex);
        if (detail_requests.size() < kMaxPendingDetailRequests) {
          detail_requests.push_back(payload);
          queued = true;
        }
      }
      if (queued) {
        detail_ready.notify_one();
      } else {
        respond("{\"v\":2,\"kind\":\"response\",\"id\":" +
                json_string(field(payload, "id").value_or("")) +
                ",\"ok\":false,\"error\":\"detail_capacity\"}");
      }
    } else {
      respond(worker.handle(payload));
    }
    if (worker.shutdown())
      break;
  }
  {
    std::lock_guard lock(detail_mutex);
    detail_input_closed = true;
  }
  detail_ready.notify_one();
  return 0;
}

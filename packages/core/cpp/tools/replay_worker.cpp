#include <algorithm>
#include <atomic>
#include <charconv>
#include <chrono>
#include <cstddef>
#include <cstdint>
#include <iostream>
#include <memory>
#include <optional>
#include <sstream>
#include <string>
#include <string_view>
#include <unordered_map>

#include "parsing/packet_parser.hpp"
#include "pruftnet/parsing/packet_tree_codec.hpp"
#include "pruftnet/replay/replay_store.hpp"
#include "pruftnet/sniffing/interface_discovery.hpp"
#include "pruftnet/sniffing/network_sniffer.hpp"

namespace {
using namespace pruftnet;

constexpr std::size_t kMaxRequestBytes = 64 * 1024;
constexpr std::size_t kMaxResponseBytes = 16 * 1024 * 1024;
constexpr std::size_t kMaxSummaryRead = 1024;
constexpr std::size_t kMaxEventRead = 512;

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

std::optional<std::string> field(std::string_view json, std::string_view key) {
  const auto marker = '"' + std::string(key) + '"';
  auto pos = json.find(marker);
  if (pos == std::string_view::npos)
    return std::nullopt;
  if (json.find(marker, pos + marker.size()) != std::string_view::npos)
    return std::nullopt;
  pos = json.find(':', pos + marker.size());
  if (pos == std::string_view::npos)
    return std::nullopt;
  pos = json.find_first_not_of(" \t", pos + 1);
  if (pos == std::string_view::npos)
    return std::nullopt;
  if (json[pos] != '"') {
    const auto end = json.find_first_of(",}", pos);
    auto value = json.substr(pos, end - pos);
    while (!value.empty() && (value.back() == ' ' || value.back() == '\t'))
      value.remove_suffix(1);
    return std::string(value);
  }
  std::string out;
  for (++pos; pos < json.size(); ++pos) {
    if (json[pos] == '"')
      return out;
    if (json[pos] == '\\' && ++pos < json.size()) {
      if (json[pos] == 'n')
        out += '\n';
      else if (json[pos] == 'r')
        out += '\r';
      else if (json[pos] == 't')
        out += '\t';
      else
        out += json[pos];
    } else
      out += json[pos];
  }
  return std::nullopt;
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

std::string base64(std::span<const std::byte> bytes) {
  static constexpr char chars[] =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  std::string out;
  out.reserve((bytes.size() + 2) / 3 * 4);
  for (std::size_t i = 0; i < bytes.size(); i += 3) {
    const auto remaining = bytes.size() - i;
    std::uint32_t value = std::to_integer<unsigned char>(bytes[i]) << 16U;
    if (remaining > 1)
      value |= std::to_integer<unsigned char>(bytes[i + 1]) << 8U;
    if (remaining > 2)
      value |= std::to_integer<unsigned char>(bytes[i + 2]);
    out += chars[(value >> 18U) & 63U];
    out += chars[(value >> 12U) & 63U];
    out += remaining > 1 ? chars[(value >> 6U) & 63U] : '=';
    out += remaining > 2 ? chars[value & 63U] : '=';
  }
  return out;
}

std::string decimal(std::uint64_t value) {
  return json_string(std::to_string(value));
}

enum class LineRead { Ok, TooLarge, End };

LineRead read_bounded_line(std::istream &input, std::string &line) {
  line.clear();
  bool too_large = false;
  char value = 0;
  while (input.get(value)) {
    if (value == '\n')
      return too_large ? LineRead::TooLarge : LineRead::Ok;
    if (!too_large) {
      if (line.size() == kMaxRequestBytes) {
        too_large = true;
        line.clear();
      } else {
        line.push_back(value);
      }
    }
  }
  if (too_large)
    return LineRead::TooLarge;
  return line.empty() ? LineRead::End : LineRead::Ok;
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
      : paths_(std::move(paths)), store_(4096, 64 * 1024 * 1024),
        journal_(8192), events_(1024) {}

  std::string handle(std::string_view request) {
    const auto id = field(request, "id");
    const auto op = field(request, "op");
    const auto version = number(request, "v");
    const std::string prefix = "{\"v\":1,\"id\":" +
                               json_string(id.value_or("")) + ',';
    if (request.size() < 2 || request.front() != '{' || request.back() != '}' ||
        !id || !op || !version)
      return prefix + "\"ok\":false,\"error\":\"malformed_request\"}";
    if (*version != 1)
      return prefix + "\"ok\":false,\"error\":\"unsupported_version\"}";
    if (*op == "start") {
      const auto token = field(request, "token");
      if (!token || token->empty())
        return prefix + "\"ok\":false,\"error\":\"malformed_request\"}";
      return start(prefix, *token);
    }
    if (*op == "shutdown") {
      if (sniffer_)
        sniffer_->stop();
      shutdown_ = true;
      return prefix + "\"ok\":true}";
    }
    if (*op == "interfaces")
      return interfaces(prefix);
    if (*op == "capabilities") {
      const auto name = field(request, "name");
      if (!name || name->empty())
        return prefix + "\"ok\":false,\"error\":\"malformed_request\"}";
      return capabilities(prefix, *name);
    }
    if (*op == "registry")
      return registry(prefix);

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

  std::optional<std::string> validate_capture(const std::string &prefix,
                                              std::string_view request) const {
    const auto high = number(request, "captureHigh");
    const auto low = number(request, "captureLow");
    if (!high || !low)
      return prefix + "\"ok\":false,\"error\":\"malformed_request\"}";
    const auto capture = sniffer_ ? sniffer_->capture_id() : std::nullopt;
    if (!capture || capture->high != *high || capture->low != *low) {
      std::string response = prefix +
                             "\"ok\":false,\"error\":\"stale_capture\"";
      if (capture)
        response += ",\"captureHigh\":" + decimal(capture->high) +
                    ",\"captureLow\":" + decimal(capture->low);
      return response + "}";
    }
    return std::nullopt;
  }

  std::string state_name() {
    if (state_.load() == State::Failed)
      return "failed";
    if (state_.load() == State::Stopped)
      return "stopped";
    if (sniffer_ && sniffer_->is_running())
      return "running";
    if (stopped_ns_.load() == 0)
      stopped_ns_ = wall_time_ns();
    return "completed";
  }

  std::string session_json() {
    const auto capture = sniffer_ ? sniffer_->capture_id() : std::nullopt;
    std::ostringstream out;
    out << "\"captureHigh\":" << decimal(capture ? capture->high : 0)
        << ",\"captureLow\":" << decimal(capture ? capture->low : 0)
        << ",\"state\":" << json_string(state_name())
        << ",\"registryRevision\":"
        << decimal(registry_ ? registry_->revision().value : 0)
        << ",\"startedAtNs\":" << decimal(started_ns_.load())
        << ",\"stoppedAtNs\":";
    if (stopped_ns_.load() == 0)
      out << "null";
    else
      out << decimal(stopped_ns_.load());
    out << ",\"failure\":null";
    return out.str();
  }

  std::string status(const std::string &prefix) {
    return prefix + "\"ok\":true," + session_json() + "}";
  }

  std::string stop(const std::string &prefix) {
    if (sniffer_)
      sniffer_->stop();
    state_ = State::Stopped;
    stopped_ns_ = wall_time_ns();
    return prefix + "\"ok\":true," + session_json() + "}";
  }
  std::string start(const std::string &prefix, const std::string &token) {
    const auto path = paths_.find(token);
    if (path == paths_.end())
      return prefix + "\"ok\":false,\"error\":\"unknown_path_token\"}";
    if (sniffer_)
      sniffer_->stop();
    store_.clear();
    journal_.clear();
    events_.clear();
    callback_failures_ = 0;
    state_ = State::Stopped;
    stopped_ns_ = 0;
    sniffing::SnifferOptions options;
    options.interfaces.emplace_back();
    options.interfaces.front().ring_slots = 1024;
    options.interfaces.front().pcap_dispatch_batch_size = 64;
    sniffer_ = std::make_unique<sniffing::NetworkSniffer>(
        sniffing::NetworkSniffer::offline(
            path->second, std::move(options),
            [this](const auto &raw, const auto &parsed) noexcept {
              try {
                if (!store_.insert(raw)) {
                  ++callback_failures_;
                  return;
                }
                const auto registry = registry_;
                if (!registry || !summary_extractor_ ||
                    !journal_.append(replay::extract_summary(
                        raw, parsed, *summary_extractor_)))
                  ++callback_failures_;
              } catch (...) {
                ++callback_failures_;
              }
            },
            [this](const sniffing::SnifferEvent &event) noexcept {
              if (!events_.append(event))
                ++callback_failures_;
              if (event.severity == sniffing::SnifferSeverity::Fatal)
                state_ = State::Failed;
            }));
    registry_ = sniffer_->registry_snapshot();
    summary_extractor_ =
        std::make_unique<parsing::SummaryExtractor>(*registry_);
    started_ns_ = wall_time_ns();
    if (const auto error = sniffer_->start()) {
      state_ = State::Failed;
      stopped_ns_ = wall_time_ns();
      return prefix + "\"ok\":false,\"error\":" + json_string(error->message) +
             ',' + session_json() + "}";
    }
    state_ = State::Running;
    return prefix + "\"ok\":true," + session_json() + "}";
  }
  std::string summaries(const std::string &prefix, std::uint64_t cursor,
                        std::uint64_t requested) {
    const auto read = journal_.read(
        cursor, std::min<std::uint64_t>(requested, kMaxSummaryRead));
    std::ostringstream out;
    const auto capture = sniffer_->capture_id();
    out << prefix << "\"ok\":true,\"captureHigh\":"
        << decimal(capture->high) << ",\"captureLow\":"
        << decimal(capture->low) << ",\"oldestAvailableCursor\":";
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
    const auto capture_complete = state == "completed" || state == "stopped" || state == "failed";
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
          << "},{\"key\":\"protocol\",\"value\":"
          << json_string(e.protocol)
          << "},{\"key\":\"length\",\"value\":" << json_string(e.length)
          << "},{\"key\":\"info\",\"value\":" << json_string(e.info)
          << "}]}";
    }
    out << "]}";
    return out.str();
  }
  std::string stats(const std::string &prefix) {
    const auto retained = store_.stats();
    const auto capture =
        sniffer_ ? sniffer_->stats() : sniffing::SnifferStatsSnapshot{};
    const auto id = sniffer_ ? sniffer_->capture_id() : std::nullopt;
    std::ostringstream out;
    out << prefix
        << "\"ok\":true,\"captureHigh\":" << decimal(id ? id->high : 0)
        << ",\"captureLow\":" << decimal(id ? id->low : 0)
        << ",\"packetsSeen\":" << decimal(capture.packets_seen)
        << ",\"packetsEnqueued\":" << decimal(capture.packets_enqueued)
        << ",\"packetsParsed\":" << decimal(capture.packets_parsed)
        << ",\"appRingDrops\":" << decimal(capture.app_ring_drops)
        << ",\"pcapDispatchCalls\":" << decimal(capture.pcap_dispatch_calls)
        << ",\"pcapDispatchErrors\":" << decimal(capture.pcap_dispatch_errors)
        << ",\"pcapReceived\":" << decimal(capture.pcap_recv)
        << ",\"pcapDropped\":" << decimal(capture.pcap_drop)
        << ",\"pcapInterfaceDropped\":" << decimal(capture.pcap_ifdrop)
        << ",\"ringDepth\":" << decimal(capture.ring_depth)
        << ",\"ringCapacity\":" << decimal(capture.ring_capacity)
        << ",\"maxRingDepth\":" << decimal(capture.max_ring_depth)
        << ",\"parserThreadRunning\":" << boolean(capture.parser_thread_running)
        << ",\"retainedPackets\":" << decimal(retained.packets)
        << ",\"retainedBytes\":" << decimal(retained.bytes)
        << ",\"retentionEvictions\":" << decimal(retained.evictions)
        << ",\"retentionRejected\":" << decimal(retained.rejected)
        << ",\"ipcDrops\":" << decimal(callback_failures_.load())
        << ",\"interfaces\":[";
    for (std::size_t index = 0; index < capture.interfaces.size(); ++index) {
      const auto &item = capture.interfaces[index];
      if (index)
        out << ',';
      out << "{\"interfaceId\":" << item.interface_id
          << ",\"interfaceName\":" << json_string(item.interface_name)
          << ",\"linkType\":" << item.link_type
          << ",\"packetsSeen\":" << decimal(item.packets_seen)
          << ",\"packetsEnqueued\":" << decimal(item.packets_enqueued)
          << ",\"packetsParsed\":" << decimal(item.packets_parsed)
          << ",\"appRingDrops\":" << decimal(item.app_ring_drops)
          << ",\"pcapDispatchCalls\":" << decimal(item.pcap_dispatch_calls)
          << ",\"pcapDispatchErrors\":" << decimal(item.pcap_dispatch_errors)
          << ",\"pcapReceived\":" << decimal(item.pcap_recv)
          << ",\"pcapDropped\":" << decimal(item.pcap_drop)
          << ",\"pcapInterfaceDropped\":" << decimal(item.pcap_ifdrop)
          << ",\"ringDepth\":" << decimal(item.ring_depth)
          << ",\"ringCapacity\":" << decimal(item.ring_capacity)
          << ",\"maxRingDepth\":" << decimal(item.max_ring_depth)
          << ",\"captureThreadRunning\":"
          << boolean(item.capture_thread_running) << '}';
    }
    out << "]}";
    return out.str();
  }
  std::string registry(const std::string &prefix) {
    if (!registry_)
      return prefix + "\"ok\":false,\"error\":\"not_started\"}";
    std::ostringstream out;
    out << prefix << "\"ok\":true,\"registryRevision\":"
        << decimal(registry_->revision().value) << ",\"protocols\":[";
    for (std::size_t i = 0; i < registry_->protocols().size(); ++i) {
      const auto &p = registry_->protocols()[i];
      if (i)
        out << ',';
      out << "{\"id\":" << p.id.value << ",\"key\":" << json_string(p.key)
          << ",\"displayName\":" << json_string(p.display_name)
          << ",\"visibilityFlags\":" << p.visibility_flags << '}';
    }
    out << "],\"fields\":[";
    for (std::size_t i = 0; i < registry_->fields().size(); ++i) {
      const auto &f = registry_->fields()[i];
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
  std::string detail(const std::string &prefix, std::string_view request) {
    const auto high = number(request, "captureHigh");
    const auto low = number(request, "captureLow");
    const auto packet_id = number(request, "packetId");
    if (!high || !low || !packet_id)
      return prefix + "\"ok\":false,\"error\":\"malformed_request\"}";
    const sniffing::PacketKey key{{*high, *low}, *packet_id};
    const std::string identity = ",\"captureHigh\":" + decimal(*high) +
                                 ",\"captureLow\":" + decimal(*low);
    const auto lookup = store_.get(key);
    if (lookup.status != replay::PacketLookup::Found)
      return prefix + "\"ok\":false,\"error\":\"" +
             (lookup.status == replay::PacketLookup::Evicted ? "evicted"
                                                              : "not_found") +
             "\"" + identity + "}";
    try {
      parsing::internal::PacketParser parser(registry_);
      const auto &retained = *lookup.packet;
      const sniffing::RawPacketView view{retained.metadata, retained.bytes};
      auto tree = parser.parse(view);
      parsing::PacketTreeEncoder encoder;
      const auto encoded = encoder.encode(tree);
      const auto *bytes = std::get_if<std::span<const std::byte>>(&encoded);
      if (!bytes)
        return prefix + "\"ok\":false,\"error\":\"encode_failed\"" +
               identity + "}";
      constexpr std::size_t kDetailEnvelopeAllowance = 1024;
      const auto max_encoded_bytes =
          (kMaxResponseBytes - kDetailEnvelopeAllowance) / 4 * 3;
      if (bytes->size() > max_encoded_bytes)
        return prefix +
               "\"ok\":false,\"error\":\"response_too_large\"" + identity +
               "}";
      return prefix + "\"ok\":true" + identity +
             ",\"format\":\"PRT2\",\"data_base64\":" +
             json_string(base64(*bytes)) + "}";
    } catch (...) {
      return prefix + "\"ok\":false,\"error\":\"detail_failed\"" +
             identity + "}";
    }
  }
  std::string events(const std::string &prefix, std::uint64_t cursor,
                     std::uint64_t requested) {
    const auto read =
        events_.read(cursor, std::min<std::uint64_t>(requested, kMaxEventRead));
    const auto capture = sniffer_->capture_id();
    std::ostringstream out;
    out << prefix << "\"ok\":true,\"captureHigh\":"
        << decimal(capture->high) << ",\"captureLow\":"
        << decimal(capture->low)
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
          << ",\"isLoopback\":" << boolean(item.is_loopback)
          << ",\"isUp\":" << boolean(item.is_up)
          << ",\"isRunning\":" << boolean(item.is_running)
          << ",\"isWireless\":" << boolean(item.is_wireless) << '}';
    }
    out << "]}";
    return out.str();
  }
  std::string capabilities(const std::string &prefix, const std::string &name) {
    const auto result = sniffing::read_interface_capabilities(name);
    if (const auto *error = std::get_if<sniffing::SnifferError>(&result))
      return prefix + "\"ok\":false,\"error\":" + json_string(error->message) +
             "}";
    const auto &value =
        std::get<sniffing::CaptureInterfaceCapabilities>(result);
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
          << ",\"isDefault\":" << boolean(item.is_default) << '}';
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
  replay::RawPacketStore store_;
  replay::SummaryJournal journal_;
  replay::EventJournal events_;
  std::unique_ptr<sniffing::NetworkSniffer> sniffer_;
  parsing::RegistrySnapshotPtr registry_;
  std::unique_ptr<parsing::SummaryExtractor> summary_extractor_;
  std::atomic<std::uint64_t> callback_failures_{0};
  std::atomic<std::uint64_t> started_ns_{0};
  std::atomic<std::uint64_t> stopped_ns_{0};
  std::atomic<State> state_{State::Stopped};
  bool shutdown_ = false;
};
} // namespace

int main(int argc, char **argv) {
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
  std::string line;
  while (true) {
    const auto line_result = read_bounded_line(std::cin, line);
    if (line_result == LineRead::End)
      break;
    if (line_result == LineRead::TooLarge)
      std::cout << "{\"v\":1,\"ok\":false,\"error\":\"request_too_large\"}\n";
    else
      std::cout << worker.handle(line) << '\n';
    std::cout.flush();
    if (worker.shutdown())
      break;
  }
  return 0;
}

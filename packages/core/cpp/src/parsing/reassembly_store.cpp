#include "parsing/reassembly_store.hpp"

#include <algorithm>
#include <optional>
#include <stdexcept>
#include <unordered_map>
#include <utility>

namespace pruftnet::parsing::internal {
namespace {

constexpr std::size_t kMaximumIpPayloadLength = 65'535;
constexpr std::uint64_t kSequenceModulus = std::uint64_t{1} << 32U;
constexpr std::uint64_t kSequenceHalfRange = kSequenceModulus / 2U;

template <typename Value>
void hash_combine(std::size_t &seed, const Value &value) noexcept {
  seed ^= std::hash<Value>{}(value) + 0x9e3779b9U + (seed << 6U) + (seed >> 2U);
}

void hash_bytes(std::size_t &seed, std::span<const std::byte> bytes) noexcept {
  for (const auto byte : bytes) {
    hash_combine(seed, std::to_integer<std::uint8_t>(byte));
  }
}

bool same_network(const NetworkLayerContext &left,
                  const NetworkLayerContext &right) noexcept {
  const auto same_address = [](std::span<const std::byte> first,
                               std::span<const std::byte> second) {
    return first.size() == second.size() &&
           std::equal(first.begin(), first.end(), second.begin());
  };
  return left.family == right.family &&
         left.address_length == right.address_length &&
         same_address(left.source_address(), right.source_address()) &&
         same_address(left.destination_address(), right.destination_address());
}

struct IpKey {
  NetworkLayerContext network;
  std::uint8_t protocol = 0;
  std::uint32_t identification = 0;
  std::uint32_t interface_id = 0;

  friend bool operator==(const IpKey &left, const IpKey &right) noexcept {
    return same_network(left.network, right.network) &&
           left.protocol == right.protocol &&
           left.identification == right.identification &&
           left.interface_id == right.interface_id;
  }
};

struct TcpKey {
  NetworkLayerContext network;
  std::uint16_t source_port = 0;
  std::uint16_t destination_port = 0;
  std::uint32_t interface_id = 0;

  friend bool operator==(const TcpKey &left, const TcpKey &right) noexcept {
    return same_network(left.network, right.network) &&
           left.source_port == right.source_port &&
           left.destination_port == right.destination_port &&
           left.interface_id == right.interface_id;
  }
};

struct IpKeyHash {
  std::size_t operator()(const IpKey &key) const noexcept {
    std::size_t result = 0;
    hash_combine(result, static_cast<std::uint8_t>(key.network.family));
    hash_combine(result, key.network.address_length);
    hash_bytes(result, key.network.source_address());
    hash_bytes(result, key.network.destination_address());
    hash_combine(result, key.protocol);
    hash_combine(result, key.identification);
    hash_combine(result, key.interface_id);
    return result;
  }
};

struct TcpKeyHash {
  std::size_t operator()(const TcpKey &key) const noexcept {
    std::size_t result = 0;
    hash_combine(result, static_cast<std::uint8_t>(key.network.family));
    hash_combine(result, key.network.address_length);
    hash_bytes(result, key.network.source_address());
    hash_bytes(result, key.network.destination_address());
    hash_combine(result, key.source_port);
    hash_combine(result, key.destination_port);
    hash_combine(result, key.interface_id);
    return result;
  }
};

struct StoredContributor {
  sniffing::PacketKey packet_key;
  std::uint32_t source_offset = 0;
  std::uint32_t source_length = 0;
  std::uint64_t destination_offset = 0;
  std::uint32_t destination_length = 0;
};

struct IpEntry {
  std::vector<std::byte> bytes;
  std::vector<std::uint8_t> present;
  std::vector<StoredContributor> contributors;
  std::optional<std::size_t> final_length;
  std::size_t present_count = 0;
  std::size_t fragment_count = 0;
  std::uint64_t last_seen = 0;
  bool overlap = false;
};

struct TcpEntry {
  std::vector<std::byte> bytes;
  std::vector<std::uint8_t> present;
  std::vector<StoredContributor> contributors;
  std::uint64_t base_sequence = 0;
  std::size_t present_count = 0;
  std::size_t segment_count = 0;
  std::uint64_t last_seen = 0;
  bool initialized = false;
  bool consumed = false;
  bool overlap = false;
  bool conflict = false;
  std::uint64_t application_state = 0;
};

std::size_t entry_storage(std::size_t bytes,
                          std::size_t contributors) noexcept {
  return bytes * 2U + contributors * sizeof(StoredContributor);
}

std::size_t storage(const IpEntry &entry) noexcept {
  return entry_storage(entry.bytes.size(), entry.contributors.size());
}

std::size_t storage(const TcpEntry &entry) noexcept {
  return entry_storage(entry.bytes.size(), entry.contributors.size());
}

std::uint64_t unwrap_sequence(std::uint32_t sequence,
                              std::uint64_t reference) noexcept {
  auto candidate =
      (reference & ~(kSequenceModulus - 1U)) | std::uint64_t{sequence};
  if (candidate + kSequenceHalfRange < reference) {
    candidate += kSequenceModulus;
  } else if (candidate > reference + kSequenceHalfRange &&
             candidate >= kSequenceModulus) {
    candidate -= kSequenceModulus;
  }
  return candidate;
}

template <typename Entry>
void append_contributor_runs(Entry &entry,
                             std::span<const ParsedContributor> contributors,
                             std::size_t input_start, std::size_t input_length,
                             std::uint64_t destination_start) {
  const auto input_end = input_start + input_length;
  for (const auto &contributor : contributors) {
    const auto contributor_start =
        static_cast<std::size_t>(contributor.destination_offset);
    const auto contributor_end =
        contributor_start +
        static_cast<std::size_t>(contributor.destination_length);
    const auto overlap_start = std::max(input_start, contributor_start);
    const auto overlap_end = std::min(input_end, contributor_end);
    if (overlap_start >= overlap_end) {
      continue;
    }

    const auto relative = overlap_start - contributor_start;
    const auto overlap_length = overlap_end - overlap_start;
    auto source_offset = contributor.source_offset;
    auto source_length = contributor.source_length;
    if (contributor.source_length == contributor.destination_length) {
      source_offset += static_cast<std::uint32_t>(relative);
      source_length = static_cast<std::uint32_t>(overlap_length);
    }
    entry.contributors.push_back(StoredContributor{
        contributor.packet_key,
        source_offset,
        source_length,
        destination_start + (overlap_start - input_start),
        static_cast<std::uint32_t>(overlap_length),
    });
  }
}

template <typename Entry>
bool add_new_byte_runs(Entry &entry, std::span<const std::byte> bytes,
                       std::span<const ParsedContributor> contributors,
                       std::size_t destination_offset, bool reject_overlap,
                       bool reject_conflict, bool &overlap, bool &conflict,
                       std::size_t contributor_limit) {
  std::size_t run_start = 0;
  bool in_run = false;
  for (std::size_t index = 0; index < bytes.size(); ++index) {
    const auto destination = destination_offset + index;
    if (entry.present[destination] != 0) {
      overlap = true;
      if (entry.bytes[destination] != bytes[index]) {
        conflict = true;
      }
      if (in_run) {
        append_contributor_runs(entry, contributors, run_start,
                                index - run_start,
                                destination_offset + run_start);
        in_run = false;
      }
      continue;
    }
    if (!in_run) {
      run_start = index;
      in_run = true;
    }
    entry.bytes[destination] = bytes[index];
    entry.present[destination] = 1;
    ++entry.present_count;
  }
  if (in_run) {
    append_contributor_runs(entry, contributors, run_start,
                            bytes.size() - run_start,
                            destination_offset + run_start);
  }
  if (entry.contributors.size() > contributor_limit) {
    return false;
  }
  return !(reject_overlap && overlap) && !(reject_conflict && conflict);
}

std::vector<ParsedContributor>
materialize_contributors(std::span<const StoredContributor> stored,
                         std::uint64_t base, std::size_t length) {
  std::vector<ParsedContributor> result;
  result.reserve(stored.size());
  const auto end = base + length;
  for (const auto &contributor : stored) {
    const auto contributor_start = contributor.destination_offset;
    const auto contributor_end =
        contributor_start + contributor.destination_length;
    const auto overlap_start = std::max(base, contributor_start);
    const auto overlap_end = std::min(end, contributor_end);
    if (overlap_start >= overlap_end) {
      continue;
    }
    const auto relative = overlap_start - contributor_start;
    const auto overlap_length = overlap_end - overlap_start;
    auto source_offset = contributor.source_offset;
    auto source_length = contributor.source_length;
    if (contributor.source_length == contributor.destination_length) {
      source_offset += static_cast<std::uint32_t>(relative);
      source_length = static_cast<std::uint32_t>(overlap_length);
    }
    result.push_back(ParsedContributor{
        contributor.packet_key,
        source_offset,
        source_length,
        static_cast<std::uint32_t>(overlap_start - base),
        static_cast<std::uint32_t>(overlap_length),
    });
  }
  return result;
}

std::vector<ParsedContributor>
slice_contributors(std::span<const ParsedContributor> contributors,
                   std::size_t offset, std::size_t length) {
  std::vector<ParsedContributor> result;
  result.reserve(contributors.size());
  const auto end = offset + length;
  for (const auto &contributor : contributors) {
    const auto contributor_start =
        static_cast<std::size_t>(contributor.destination_offset);
    const auto contributor_end =
        contributor_start +
        static_cast<std::size_t>(contributor.destination_length);
    const auto overlap_start = std::max(offset, contributor_start);
    const auto overlap_end = std::min(end, contributor_end);
    if (overlap_start >= overlap_end) {
      continue;
    }
    const auto relative = overlap_start - contributor_start;
    const auto overlap_length = overlap_end - overlap_start;
    auto source_offset = contributor.source_offset;
    auto source_length = contributor.source_length;
    if (contributor.source_length == contributor.destination_length) {
      source_offset += static_cast<std::uint32_t>(relative);
      source_length = static_cast<std::uint32_t>(overlap_length);
    }
    result.push_back(ParsedContributor{
        contributor.packet_key,
        source_offset,
        source_length,
        static_cast<std::uint32_t>(overlap_start - offset),
        static_cast<std::uint32_t>(overlap_length),
    });
  }
  return result;
}

template <typename Map>
typename Map::iterator least_recently_seen(Map &entries) {
  return std::min_element(
      entries.begin(), entries.end(), [](const auto &left, const auto &right) {
        return left.second.last_seen < right.second.last_seen;
      });
}

IpKey ip_key(const IpFragmentInput &input) {
  return IpKey{input.network, input.protocol, input.identification,
               input.interface_id};
}

TcpKey tcp_key(const TcpSegmentInput &input) {
  return TcpKey{input.network, input.source_port, input.destination_port,
                input.interface_id};
}

} // namespace

struct ReassemblyStore::Impl {
  explicit Impl(ReassemblyBudget configured_budget)
      : budget(configured_budget) {
    if (budget.max_ip_datagrams == 0 || budget.max_tcp_flows == 0 ||
        budget.max_buffered_bytes == 0 ||
        budget.max_ip_fragments_per_datagram == 0 ||
        budget.max_tcp_segments_per_flow == 0 ||
        budget.max_contributors_per_item == 0 ||
        budget.max_tcp_bytes_per_flow == 0 || budget.max_idle_packets == 0) {
      throw std::invalid_argument("ReassemblyStore requires non-zero limits.");
    }
    ip_entries.reserve(std::min<std::size_t>(budget.max_ip_datagrams, 4'096));
    tcp_entries.reserve(std::min<std::size_t>(budget.max_tcp_flows, 8'192));
  }

  template <typename Map>
  void erase_entry(Map &entries, typename Map::iterator entry) noexcept {
    if (entry == entries.end()) {
      return;
    }
    buffered -= storage(entry->second);
    entries.erase(entry);
  }

  template <typename Map>
  bool make_room(Map &entries, std::size_t additional,
                 const typename Map::key_type *preserve = nullptr) {
    while (additional > budget.max_buffered_bytes - buffered) {
      auto oldest = least_recently_seen(entries);
      if (oldest == entries.end()) {
        return false;
      }
      if (preserve != nullptr && oldest->first == *preserve) {
        auto alternative = entries.end();
        for (auto candidate = entries.begin(); candidate != entries.end();
             ++candidate) {
          if (candidate->first == *preserve) {
            continue;
          }
          if (alternative == entries.end() ||
              candidate->second.last_seen < alternative->second.last_seen) {
            alternative = candidate;
          }
        }
        if (alternative == entries.end()) {
          return false;
        }
        oldest = alternative;
      }
      erase_entry(entries, oldest);
    }
    return true;
  }

  template <typename Map> void expire(Map &entries) noexcept {
    for (auto entry = entries.begin(); entry != entries.end();) {
      if (entry->second.last_seen + budget.max_idle_packets < tick) {
        const auto stale = entry++;
        erase_entry(entries, stale);
      } else {
        ++entry;
      }
    }
  }

  void begin_packet(const sniffing::PacketMetadata &metadata) {
    if (!capture_initialized || metadata.key.capture_id != capture_id) {
      clear();
      capture_id = metadata.key.capture_id;
      capture_initialized = true;
    }
    ++tick;
    if ((tick & 0xffU) == 0) {
      expire(ip_entries);
      expire(tcp_entries);
    }
  }

  void clear() noexcept {
    ip_entries.clear();
    tcp_entries.clear();
    buffered = 0;
    tick = 0;
    capture_initialized = false;
  }

  ReassembledPayload submit_ip(const IpFragmentInput &input) {
    ReassembledPayload result;
    if ((input.network.family == IpFamily::V4 &&
         input.network.address_length != 4) ||
        (input.network.family == IpFamily::V6 &&
         input.network.address_length != 16) ||
        input.bytes.empty() || input.contributors.empty() ||
        input.offset > kMaximumIpPayloadLength ||
        input.bytes.size() > kMaximumIpPayloadLength - input.offset) {
      result.status = ReassemblyStatus::Invalid;
      return result;
    }

    const auto key = ip_key(input);
    auto found = ip_entries.find(key);
    if (found == ip_entries.end()) {
      while (ip_entries.size() >= budget.max_ip_datagrams) {
        const auto oldest = least_recently_seen(ip_entries);
        if (oldest == ip_entries.end()) {
          result.status = ReassemblyStatus::ResourceLimit;
          return result;
        }
        erase_entry(ip_entries, oldest);
      }
      found = ip_entries.emplace(key, IpEntry{}).first;
    }
    auto &entry = found->second;
    entry.last_seen = tick;
    if (entry.fragment_count >= budget.max_ip_fragments_per_datagram) {
      erase_entry(ip_entries, found);
      result.status = ReassemblyStatus::ResourceLimit;
      return result;
    }

    const auto end = input.offset + input.bytes.size();
    if (entry.final_length && end > *entry.final_length) {
      erase_entry(ip_entries, found);
      result.status = ReassemblyStatus::Invalid;
      return result;
    }
    if (!input.more_fragments) {
      if (entry.final_length && *entry.final_length != end) {
        erase_entry(ip_entries, found);
        result.status = ReassemblyStatus::Invalid;
        return result;
      }
      if (entry.bytes.size() > end) {
        erase_entry(ip_entries, found);
        result.status = ReassemblyStatus::Invalid;
        return result;
      }
      entry.final_length = end;
    }

    const auto old_storage = storage(entry);
    if (end > entry.bytes.size()) {
      const auto additional = (end - entry.bytes.size()) * 2U;
      if (!make_room(ip_entries, additional, &key)) {
        erase_entry(ip_entries, found);
        result.status = ReassemblyStatus::ResourceLimit;
        return result;
      }
      entry.bytes.resize(end);
      entry.present.resize(end, 0);
    }

    bool overlap = false;
    bool conflict = false;
    const bool reject_overlap = input.network.family == IpFamily::V6;
    const bool accepted = add_new_byte_runs(
        entry, input.bytes, input.contributors, input.offset, reject_overlap,
        true, overlap, conflict, budget.max_contributors_per_item);
    const auto new_storage = storage(entry);
    const auto storage_delta = new_storage - old_storage;
    const bool within_budget = make_room(ip_entries, storage_delta, &key);
    buffered += storage_delta;
    if (!accepted || !within_budget) {
      erase_entry(ip_entries, found);
      result.status = conflict  ? ReassemblyStatus::Conflict
                      : overlap ? ReassemblyStatus::Overlap
                                : ReassemblyStatus::ResourceLimit;
      result.overlap = overlap;
      result.conflict = conflict;
      return result;
    }
    ++entry.fragment_count;
    entry.overlap |= overlap;

    if (!entry.final_length || entry.present_count != *entry.final_length) {
      result.status =
          overlap ? ReassemblyStatus::Overlap : ReassemblyStatus::Incomplete;
      result.overlap = entry.overlap;
      result.part_count = entry.fragment_count;
      return result;
    }

    result.status = ReassemblyStatus::Complete;
    result.bytes.assign(entry.bytes.begin(),
                        entry.bytes.begin() +
                            static_cast<std::ptrdiff_t>(*entry.final_length));
    result.contributors =
        materialize_contributors(entry.contributors, 0, *entry.final_length);
    result.part_count = entry.fragment_count;
    result.overlap = entry.overlap;
    erase_entry(ip_entries, found);
    return result;
  }

  ReassembledPayload submit_tcp(const TcpSegmentInput &input) {
    ReassembledPayload result;
    if ((input.network.family == IpFamily::V4 &&
         input.network.address_length != 4) ||
        (input.network.family == IpFamily::V6 &&
         input.network.address_length != 16) ||
        input.bytes.empty() || input.contributors.empty()) {
      result.status = input.bytes.empty() ? ReassemblyStatus::Incomplete
                                          : ReassemblyStatus::Invalid;
      return result;
    }

    const auto key = tcp_key(input);
    auto found = tcp_entries.find(key);
    if (found == tcp_entries.end()) {
      while (tcp_entries.size() >= budget.max_tcp_flows) {
        const auto oldest = least_recently_seen(tcp_entries);
        if (oldest == tcp_entries.end()) {
          result.status = ReassemblyStatus::ResourceLimit;
          return result;
        }
        erase_entry(tcp_entries, oldest);
      }
      found = tcp_entries.emplace(key, TcpEntry{}).first;
    }
    auto &entry = found->second;
    entry.last_seen = tick;
    if (entry.segment_count >= budget.max_tcp_segments_per_flow) {
      erase_entry(tcp_entries, found);
      result.status = ReassemblyStatus::ResourceLimit;
      return result;
    }

    const auto payload_sequence =
        static_cast<std::uint32_t>(input.sequence + (input.syn ? 1U : 0U));
    std::uint64_t sequence = payload_sequence;
    if (!entry.initialized) {
      entry.base_sequence = payload_sequence;
      entry.initialized = true;
    } else {
      sequence = unwrap_sequence(payload_sequence,
                                 entry.base_sequence + entry.bytes.size());
    }
    auto bytes = input.bytes;
    auto contributors = input.contributors;
    std::size_t contributor_trim = 0;

    if (sequence < entry.base_sequence) {
      const auto difference = entry.base_sequence - sequence;
      if (entry.consumed) {
        if (difference >= bytes.size()) {
          result.status = ReassemblyStatus::Duplicate;
          return result;
        }
        contributor_trim = static_cast<std::size_t>(difference);
        bytes = bytes.subspan(contributor_trim);
        sequence = entry.base_sequence;
      } else {
        if (difference > budget.max_tcp_bytes_per_flow - entry.bytes.size()) {
          erase_entry(tcp_entries, found);
          result.status = ReassemblyStatus::ResourceLimit;
          return result;
        }
        const auto old_storage = storage(entry);
        if (!make_room(tcp_entries, static_cast<std::size_t>(difference) * 2U,
                       &key)) {
          erase_entry(tcp_entries, found);
          result.status = ReassemblyStatus::ResourceLimit;
          return result;
        }
        entry.bytes.insert(entry.bytes.begin(),
                           static_cast<std::size_t>(difference), std::byte{0});
        entry.present.insert(entry.present.begin(),
                             static_cast<std::size_t>(difference), 0);
        entry.base_sequence = sequence;
        for (auto &contributor : entry.contributors) {
          contributor.destination_offset += difference;
        }
        buffered += storage(entry) - old_storage;
      }
    }

    const auto destination_offset =
        static_cast<std::size_t>(sequence - entry.base_sequence);
    if (bytes.size() > budget.max_tcp_bytes_per_flow - destination_offset) {
      erase_entry(tcp_entries, found);
      result.status = ReassemblyStatus::ResourceLimit;
      return result;
    }
    const auto end = destination_offset + bytes.size();
    const auto old_storage = storage(entry);
    if (end > entry.bytes.size()) {
      const auto additional = (end - entry.bytes.size()) * 2U;
      if (!make_room(tcp_entries, additional, &key)) {
        erase_entry(tcp_entries, found);
        result.status = ReassemblyStatus::ResourceLimit;
        return result;
      }
      entry.bytes.resize(end);
      entry.present.resize(end, 0);
    }

    std::vector<ParsedContributor> trimmed_contributors;
    if (contributor_trim != 0) {
      trimmed_contributors =
          slice_contributors(contributors, contributor_trim, bytes.size());
      contributors = trimmed_contributors;
    }

    bool overlap = false;
    bool conflict = false;
    const bool accepted = add_new_byte_runs(
        entry, bytes, contributors, destination_offset, false, false, overlap,
        conflict, budget.max_contributors_per_item);
    const auto new_storage = storage(entry);
    const auto storage_delta = new_storage - old_storage;
    const bool within_budget = make_room(tcp_entries, storage_delta, &key);
    buffered += storage_delta;
    if (!accepted || !within_budget) {
      erase_entry(tcp_entries, found);
      result.status = conflict ? ReassemblyStatus::Conflict
                               : ReassemblyStatus::ResourceLimit;
      result.overlap = overlap;
      result.conflict = conflict;
      return result;
    }
    ++entry.segment_count;
    entry.overlap |= overlap;
    entry.conflict |= conflict;

    const auto contiguous = static_cast<std::size_t>(
        std::find(entry.present.begin(), entry.present.end(), 0) -
        entry.present.begin());
    if (contiguous == 0) {
      result.status =
          overlap ? ReassemblyStatus::Overlap : ReassemblyStatus::Incomplete;
      result.overlap = entry.overlap;
      result.conflict = entry.conflict;
      result.part_count = entry.segment_count;
      return result;
    }
    result.status = conflict  ? ReassemblyStatus::Conflict
                    : overlap ? ReassemblyStatus::Overlap
                              : ReassemblyStatus::Complete;
    result.bytes.assign(entry.bytes.begin(),
                        entry.bytes.begin() +
                            static_cast<std::ptrdiff_t>(contiguous));
    result.contributors =
        materialize_contributors(entry.contributors, 0, contiguous);
    result.part_count = entry.segment_count;
    result.overlap = entry.overlap;
    result.conflict = entry.conflict;
    return result;
  }

  bool consume_tcp(const TcpSegmentInput &input, std::size_t length) {
    const auto key = tcp_key(input);
    const auto found = tcp_entries.find(key);
    if (found == tcp_entries.end()) {
      return length == 0;
    }
    auto &entry = found->second;
    const auto contiguous = static_cast<std::size_t>(
        std::find(entry.present.begin(), entry.present.end(), 0) -
        entry.present.begin());
    if (length > contiguous) {
      return false;
    }
    if (length == 0) {
      return true;
    }

    const auto old_storage = storage(entry);
    entry.bytes.erase(entry.bytes.begin(),
                      entry.bytes.begin() +
                          static_cast<std::ptrdiff_t>(length));
    entry.present.erase(entry.present.begin(),
                        entry.present.begin() +
                            static_cast<std::ptrdiff_t>(length));
    entry.present_count -= length;
    entry.base_sequence += length;
    entry.consumed = true;

    for (auto contributor = entry.contributors.begin();
         contributor != entry.contributors.end();) {
      const auto end =
          contributor->destination_offset + contributor->destination_length;
      if (end <= length) {
        contributor = entry.contributors.erase(contributor);
        continue;
      }
      if (contributor->destination_offset < length) {
        const auto trim =
            static_cast<std::size_t>(length - contributor->destination_offset);
        if (contributor->source_length == contributor->destination_length) {
          contributor->source_offset += static_cast<std::uint32_t>(trim);
          contributor->source_length -= static_cast<std::uint32_t>(trim);
        }
        contributor->destination_length -= static_cast<std::uint32_t>(trim);
        contributor->destination_offset = 0;
      } else {
        contributor->destination_offset -= length;
      }
      ++contributor;
    }
    buffered -= old_storage - storage(entry);
    if (entry.bytes.empty() && entry.application_state == 0) {
      erase_entry(tcp_entries, found);
    }
    return true;
  }

  std::uint64_t
  tcp_application_state(const TcpSegmentInput &input) const noexcept {
    const auto found = tcp_entries.find(tcp_key(input));
    return found == tcp_entries.end() ? 0 : found->second.application_state;
  }

  bool set_tcp_application_state(const TcpSegmentInput &input,
                                 std::uint64_t state) {
    const auto key = tcp_key(input);
    auto found = tcp_entries.find(key);
    if (found == tcp_entries.end()) {
      if (state == 0) {
        return true;
      }
      while (tcp_entries.size() >= budget.max_tcp_flows) {
        const auto oldest = least_recently_seen(tcp_entries);
        if (oldest == tcp_entries.end()) {
          return false;
        }
        erase_entry(tcp_entries, oldest);
      }
      found = tcp_entries.emplace(key, TcpEntry{}).first;
    }
    found->second.last_seen = tick;
    found->second.application_state = state;
    if (state == 0 && found->second.bytes.empty()) {
      erase_entry(tcp_entries, found);
    }
    return true;
  }

  void close_tcp(const TcpSegmentInput &input) noexcept {
    const auto found = tcp_entries.find(tcp_key(input));
    erase_entry(tcp_entries, found);
  }

  ReassemblyBudget budget;
  std::unordered_map<IpKey, IpEntry, IpKeyHash> ip_entries;
  std::unordered_map<TcpKey, TcpEntry, TcpKeyHash> tcp_entries;
  sniffing::CaptureId capture_id;
  std::size_t buffered = 0;
  std::uint64_t tick = 0;
  bool capture_initialized = false;
};

ReassemblyStore::ReassemblyStore(ReassemblyBudget budget)
    : impl_(std::make_unique<Impl>(budget)) {}

ReassemblyStore::~ReassemblyStore() = default;

ReassemblyStore::ReassemblyStore(ReassemblyStore &&) noexcept = default;

ReassemblyStore &
ReassemblyStore::operator=(ReassemblyStore &&) noexcept = default;

void ReassemblyStore::begin_packet(const sniffing::PacketMetadata &metadata) {
  impl_->begin_packet(metadata);
}

void ReassemblyStore::clear() noexcept { impl_->clear(); }

ReassembledPayload
ReassemblyStore::submit_ip_fragment(const IpFragmentInput &input) {
  return impl_->submit_ip(input);
}

ReassembledPayload
ReassemblyStore::submit_tcp_segment(const TcpSegmentInput &input) {
  return impl_->submit_tcp(input);
}

bool ReassemblyStore::consume_tcp(const TcpSegmentInput &input,
                                  std::size_t length) {
  return impl_->consume_tcp(input, length);
}

std::uint64_t ReassemblyStore::tcp_application_state(
    const TcpSegmentInput &input) const noexcept {
  return impl_->tcp_application_state(input);
}

bool ReassemblyStore::set_tcp_application_state(const TcpSegmentInput &input,
                                                std::uint64_t state) {
  return impl_->set_tcp_application_state(input, state);
}

void ReassemblyStore::close_tcp(const TcpSegmentInput &input) noexcept {
  impl_->close_tcp(input);
}

std::size_t ReassemblyStore::ip_datagram_count() const noexcept {
  return impl_->ip_entries.size();
}

std::size_t ReassemblyStore::tcp_flow_count() const noexcept {
  return impl_->tcp_entries.size();
}

std::size_t ReassemblyStore::buffered_bytes() const noexcept {
  return impl_->buffered;
}

} // namespace pruftnet::parsing::internal

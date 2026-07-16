#include "parsing/dissector_context.hpp"

#include <algorithm>
#include <cstring>
#include <limits>
#include <stdexcept>
#include <utility>
#include <variant>

namespace pruftnet::parsing::internal {
namespace {

constexpr std::string_view kCapturedSourceName = "Captured frame";

bool is_resource_error(TreeBuildErrorCode code) noexcept {
  return code >= TreeBuildErrorCode::MaxNodes &&
         code <= TreeBuildErrorCode::AllocationFailed;
}

} // namespace

DissectorContext::DissectorContext(const DissectorCatalog &catalog,
                                   const sniffing::RawPacketView &packet,
                                   ParseBudget budget, ParsedPacketTree storage,
                                   ReassemblyStore &reassembly)
    : catalog_(catalog), packet_(packet), budget_(budget),
      builder_(catalog_.registry(), packet.metadata.key, std::move(storage),
               budget),
      reassembly_(reassembly) {}

std::optional<DataSourceId>
DissectorContext::add_source(std::span<const std::byte> bytes) {
  return accept(builder_.add_data_source(kCapturedSourceName, bytes,
                                         DataSourceKind::Captured));
}

std::optional<DataSourceId> DissectorContext::add_derived_source(
    std::string_view name, std::span<const std::byte> bytes,
    std::span<const ParsedContributor> contributors) {
  return accept(builder_.add_data_source(name, bytes, DataSourceKind::Derived,
                                         contributors));
}

std::optional<std::uint32_t>
DissectorContext::add_protocol(FieldId field, std::uint32_t parent,
                               const PacketView &view, std::size_t length) {
  return accept(builder_.add_none(field, parent, view.data_source_id(),
                                  view.absolute_offset(), length));
}

std::optional<std::uint32_t>
DissectorContext::add_unsigned(FieldId field, std::uint32_t parent,
                               const PacketView &view, std::size_t offset,
                               std::size_t length, std::uint64_t value,
                               std::uint32_t flags) {
  return accept(builder_.add_unsigned(field, parent, view.data_source_id(),
                                      view.absolute_offset() + offset, length,
                                      value, flags));
}

std::optional<std::uint32_t>
DissectorContext::add_signed(FieldId field, std::uint32_t parent,
                             const PacketView &view, std::size_t offset,
                             std::size_t length, std::int64_t value,
                             std::uint32_t flags) {
  return accept(builder_.add_signed(field, parent, view.data_source_id(),
                                    view.absolute_offset() + offset, length,
                                    value, flags));
}

bool DissectorContext::add_bytes(FieldId field, std::uint32_t parent,
                                 const PacketView &view, std::size_t offset,
                                 std::span<const std::byte> value) {
  return accept(builder_.add_source_bytes(field, parent, view.data_source_id(),
                                          view.absolute_offset() + offset,
                                          value.size()))
      .has_value();
}

bool DissectorContext::add_string(FieldId field, std::uint32_t parent,
                                  const PacketView &view, std::size_t offset,
                                  std::size_t length, std::string_view value) {
  return accept(builder_.add_string(field, parent, view.data_source_id(),
                                    view.absolute_offset() + offset, length,
                                    value))
      .has_value();
}

bool DissectorContext::add_unknown(std::uint32_t parent, const PacketView &view,
                                   std::size_t offset,
                                   std::size_t logical_length) {
  if (offset > view.captured_length()) {
    return true;
  }
  const auto available =
      std::min(logical_length, view.captured_length() - offset);
  return add_bytes(common().unknown_data, parent, view, offset,
                   view.captured().subspan(offset, available));
}

std::vector<ParsedContributor>
DissectorContext::contributors_for(const PacketView &view, std::size_t offset,
                                   std::size_t length) const {
  std::vector<ParsedContributor> result;
  if (offset > view.captured_length() ||
      length > view.captured_length() - offset ||
      view.absolute_offset() >
          std::numeric_limits<std::uint32_t>::max() - offset) {
    return result;
  }
  const auto source_offset = view.absolute_offset() + offset;
  const auto sources = builder_.data_sources();
  if (view.data_source_id() >= sources.size()) {
    return result;
  }
  const auto &source = sources[view.data_source_id()];
  if (source.kind == DataSourceKind::Captured) {
    result.push_back(ParsedContributor{
        packet_.metadata.key,
        static_cast<std::uint32_t>(source_offset),
        static_cast<std::uint32_t>(length),
        0,
        static_cast<std::uint32_t>(length),
    });
    return result;
  }

  const auto requested_end = source_offset + length;
  for (const auto &contributor :
       builder_.source_contributors(view.data_source_id())) {
    const auto contributor_start =
        static_cast<std::size_t>(contributor.destination_offset);
    const auto contributor_end =
        contributor_start +
        static_cast<std::size_t>(contributor.destination_length);
    const auto overlap_start = std::max(source_offset, contributor_start);
    const auto overlap_end = std::min(requested_end, contributor_end);
    if (overlap_start >= overlap_end) {
      continue;
    }
    const auto relative = overlap_start - contributor_start;
    const auto overlap_length = overlap_end - overlap_start;
    auto original_offset = contributor.source_offset;
    auto original_length = contributor.source_length;
    if (contributor.source_length == contributor.destination_length) {
      original_offset += static_cast<std::uint32_t>(relative);
      original_length = static_cast<std::uint32_t>(overlap_length);
    }
    result.push_back(ParsedContributor{
        contributor.packet_key,
        original_offset,
        original_length,
        static_cast<std::uint32_t>(overlap_start - source_offset),
        static_cast<std::uint32_t>(overlap_length),
    });
  }
  return result;
}

bool DissectorContext::push_network_layer(
    IpFamily family, std::span<const std::byte> source,
    std::span<const std::byte> destination) {
  const auto expected =
      family == IpFamily::V4 ? std::size_t{4} : std::size_t{16};
  if (source.size() != expected || destination.size() != expected) {
    mark_malformed();
    return false;
  }
  if (network_layer_count_ >= network_layers_.size()) {
    mark_resource_limit();
    return false;
  }
  auto &layer = network_layers_[network_layer_count_++];
  layer = NetworkLayerContext{};
  layer.family = family;
  layer.address_length = static_cast<std::uint8_t>(expected);
  std::copy(source.begin(), source.end(), layer.source.begin());
  std::copy(destination.begin(), destination.end(), layer.destination.begin());
  return true;
}

void DissectorContext::pop_network_layer() noexcept {
  if (network_layer_count_ != 0) {
    --network_layer_count_;
  }
}

const NetworkLayerContext *DissectorContext::network_layer() const noexcept {
  return network_layer_count_ == 0 ? nullptr
                                   : &network_layers_[network_layer_count_ - 1];
}

ReassembledPayload DissectorContext::submit_ip_fragment(
    IpFamily family, std::span<const std::byte> source,
    std::span<const std::byte> destination, std::uint8_t protocol,
    std::uint32_t identification, std::size_t offset, bool more_fragments,
    const PacketView &payload) {
  NetworkLayerContext network;
  network.family = family;
  const auto expected =
      family == IpFamily::V4 ? std::size_t{4} : std::size_t{16};
  if (source.size() != expected || destination.size() != expected) {
    return ReassembledPayload{.status = ReassemblyStatus::Invalid};
  }
  network.address_length = static_cast<std::uint8_t>(expected);
  std::copy(source.begin(), source.end(), network.source.begin());
  std::copy(destination.begin(), destination.end(),
            network.destination.begin());
  const auto contributors =
      contributors_for(payload, 0, payload.captured_length());
  return reassembly_.submit_ip_fragment(IpFragmentInput{
      .network = network,
      .protocol = protocol,
      .identification = identification,
      .interface_id = packet_.metadata.interface_id,
      .offset = offset,
      .more_fragments = more_fragments,
      .bytes = payload.captured(),
      .contributors = contributors,
  });
}

ReassembledPayload DissectorContext::submit_tcp_segment(
    std::uint16_t source_port, std::uint16_t destination_port,
    std::uint32_t sequence, bool syn, const PacketView &payload) {
  const auto *network = network_layer();
  if (network == nullptr) {
    return ReassembledPayload{.status = ReassemblyStatus::Invalid};
  }
  const auto contributors =
      contributors_for(payload, 0, payload.captured_length());
  return reassembly_.submit_tcp_segment(TcpSegmentInput{
      .network = *network,
      .source_port = source_port,
      .destination_port = destination_port,
      .interface_id = packet_.metadata.interface_id,
      .sequence = sequence,
      .syn = syn,
      .bytes = payload.captured(),
      .contributors = contributors,
  });
}

bool DissectorContext::consume_tcp_stream(std::uint16_t source_port,
                                          std::uint16_t destination_port,
                                          std::uint32_t sequence, bool syn,
                                          std::size_t length) {
  const auto *network = network_layer();
  return network != nullptr &&
         reassembly_.consume_tcp(
             TcpSegmentInput{
                 .network = *network,
                 .source_port = source_port,
                 .destination_port = destination_port,
                 .interface_id = packet_.metadata.interface_id,
                 .sequence = sequence,
                 .syn = syn,
             },
             length);
}

void DissectorContext::close_tcp_stream(std::uint16_t source_port,
                                        std::uint16_t destination_port,
                                        std::uint32_t sequence,
                                        bool syn) noexcept {
  const auto *network = network_layer();
  if (network == nullptr) {
    return;
  }
  reassembly_.close_tcp(TcpSegmentInput{
      .network = *network,
      .source_port = source_port,
      .destination_port = destination_port,
      .interface_id = packet_.metadata.interface_id,
      .sequence = sequence,
      .syn = syn,
  });
}

void DissectorContext::begin_tcp_application(std::uint16_t source_port,
                                             std::uint16_t destination_port,
                                             std::uint32_t sequence,
                                             bool syn) noexcept {
  const auto *network = network_layer();
  if (network == nullptr) {
    tcp_application_.reset();
    return;
  }
  tcp_application_ = TcpSegmentInput{
      .network = *network,
      .source_port = source_port,
      .destination_port = destination_port,
      .interface_id = packet_.metadata.interface_id,
      .sequence = sequence,
      .syn = syn,
  };
}

void DissectorContext::end_tcp_application() noexcept {
  tcp_application_.reset();
}

std::uint64_t DissectorContext::tcp_application_state() const noexcept {
  return tcp_application_.has_value()
             ? reassembly_.tcp_application_state(*tcp_application_)
             : 0;
}

bool DissectorContext::set_tcp_application_state(std::uint64_t state) {
  return tcp_application_.has_value() &&
         reassembly_.set_tcp_application_state(*tcp_application_, state);
}

void DissectorContext::set_transport_end_of_stream(bool value) noexcept {
  transport_end_of_stream_ = value;
}

bool DissectorContext::transport_end_of_stream() const noexcept {
  return transport_end_of_stream_;
}

void DissectorContext::mark_partial() {
  if (builder_.condition() == ParseCondition::Complete) {
    (void)builder_.set_condition(ParseCondition::Partial);
  }
}

void DissectorContext::mark_malformed() {
  if (builder_.condition() != ParseCondition::ResourceLimit) {
    (void)builder_.set_condition(ParseCondition::Malformed);
  }
}

void DissectorContext::mark_resource_limit() {
  (void)builder_.set_condition(ParseCondition::ResourceLimit);
  stopped_ = true;
}

bool DissectorContext::stopped() const noexcept { return stopped_; }

const sniffing::RawPacketView &DissectorContext::packet() const noexcept {
  return packet_;
}

const CommonDissectorState &DissectorContext::common() const noexcept {
  return catalog_.common();
}

ParsedPacketTree DissectorContext::finalize() {
  auto result = builder_.finalize();
  if (auto *tree = std::get_if<ParsedPacketTree>(&result)) {
    return std::move(*tree);
  }
  throw std::runtime_error(
      "The packet parser could not finalize a structurally valid tree.");
}

template <typename Value>
std::optional<Value> DissectorContext::accept(TreeResult<Value> result) {
  if (auto *value = std::get_if<Value>(&result)) {
    return std::move(*value);
  }
  const auto error = std::get<TreeBuildError>(result);
  if (is_resource_error(error.code)) {
    mark_resource_limit();
    return std::nullopt;
  }
  throw std::logic_error(
      "A dissector attempted to construct an invalid tree node.");
}

template std::optional<std::uint32_t>
DissectorContext::accept(TreeResult<std::uint32_t> result);

} // namespace pruftnet::parsing::internal

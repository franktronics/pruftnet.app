#include "parsing/dissectors/ipv4_dissector.hpp"

#include <algorithm>

#include "parsing/dissector_context.hpp"
#include "parsing/dissectors/dissector_states.hpp"

namespace pruftnet::parsing::internal {
namespace {
constexpr std::size_t kMinimumHeaderLength = 20;

std::size_t protocol_span(const PacketView &view,
                          std::size_t logical_length) noexcept {
  return std::min(view.captured_length(), logical_length);
}
} // namespace

DissectionResult dissect_ipv4(DissectorContext &context, const void *opaque,
                              const PacketView &view, std::uint32_t parent) {
  const auto &state = *static_cast<const Ipv4DissectorState *>(opaque);
  const auto first_byte = context.read(view.read_u8(0));
  const auto total_length = context.read(view.read_be16(2));
  const auto ip_node = context.add_protocol(
      state.packet, parent, view,
      total_length
          ? protocol_span(view, std::max<std::size_t>(*total_length,
                                                      kMinimumHeaderLength))
          : view.captured_length());
  if (!ip_node || !first_byte || !total_length || context.stopped()) {
    return {};
  }

  const auto version = static_cast<std::uint8_t>(*first_byte >> 4U);
  const auto header_length = static_cast<std::size_t>(*first_byte & 0x0fU) * 4U;
  const auto dscp_ecn = context.read(view.read_u8(1));
  const auto identification = context.read(view.read_be16(4));
  const auto flags_fragment = context.read(view.read_be16(6));
  const auto ttl = context.read(view.read_u8(8));
  const auto protocol = context.read(view.read_u8(9));
  const auto checksum = context.read(view.read_be16(10));
  const auto source = context.read(view.read_bytes(12, 4));
  const auto destination = context.read(view.read_bytes(16, 4));
  if (!dscp_ecn || !identification || !flags_fragment || !ttl || !protocol ||
      !checksum || !source || !destination) {
    return {};
  }
  const auto reserved_flag =
      static_cast<std::uint8_t>((*flags_fragment >> 15U) & 1U);
  const auto dont_fragment =
      static_cast<std::uint8_t>((*flags_fragment >> 14U) & 1U);
  const auto more_fragments =
      static_cast<std::uint8_t>((*flags_fragment >> 13U) & 1U);
  const auto fragment_offset_encoded =
      static_cast<std::uint16_t>(*flags_fragment & 0x1fffU);
  const auto fragment_offset =
      static_cast<std::size_t>(fragment_offset_encoded) * 8U;
  if (!context.add_unsigned(state.version, *ip_node, view, 0, 1, version) ||
      !context.add_unsigned(state.header_length, *ip_node, view, 0, 1,
                            header_length) ||
      !context.add_unsigned(state.dscp_ecn, *ip_node, view, 1, 1, *dscp_ecn) ||
      !context.add_unsigned(state.total_length, *ip_node, view, 2, 2,
                            *total_length) ||
      !context.add_unsigned(state.identification, *ip_node, view, 4, 2,
                            *identification) ||
      !context.add_unsigned(state.flags, *ip_node, view, 6, 2,
                            *flags_fragment >> 13U) ||
      !context.add_unsigned(state.reserved_flag, *ip_node, view, 6, 2,
                            reserved_flag) ||
      !context.add_unsigned(state.dont_fragment, *ip_node, view, 6, 2,
                            dont_fragment) ||
      !context.add_unsigned(state.more_fragments, *ip_node, view, 6, 2,
                            more_fragments) ||
      !context.add_unsigned(state.fragment_offset_encoded, *ip_node, view, 6, 2,
                            fragment_offset_encoded) ||
      !context.add_unsigned(state.fragment_offset, *ip_node, view, 6, 2,
                            fragment_offset) ||
      !context.add_unsigned(state.ttl, *ip_node, view, 8, 1, *ttl) ||
      !context.add_unsigned(state.protocol, *ip_node, view, 9, 1, *protocol) ||
      !context.add_unsigned(state.checksum, *ip_node, view, 10, 2, *checksum) ||
      !context.add_bytes(state.source, *ip_node, view, 12, *source) ||
      !context.add_bytes(state.destination, *ip_node, view, 16, *destination)) {
    return {};
  }
  if (version != 4 || header_length < kMinimumHeaderLength ||
      *total_length < header_length || *total_length > view.reported_length()) {
    context.mark_malformed();
    return {};
  }
  if (header_length > kMinimumHeaderLength) {
    const auto options = context.read(view.read_bytes(
        kMinimumHeaderLength, header_length - kMinimumHeaderLength));
    if (!options || !context.add_bytes(state.options, *ip_node, view,
                                       kMinimumHeaderLength, *options)) {
      return {};
    }
  }
  const auto payload_length = *total_length - header_length;
  const auto payload_result =
      view.subview(header_length, payload_length, payload_length);
  if (!payload_result.has_value()) {
    context.mark_malformed();
    return {};
  }
  const auto &payload = *payload_result.value();
  if (payload.captured_length() < payload_length) {
    context.mark_partial();
  }
  const bool fragmented = more_fragments != 0 || fragment_offset_encoded != 0;
  const bool invalid_fragment =
      reserved_flag != 0 || (dont_fragment != 0 && fragmented) ||
      (fragmented && payload_length == 0) ||
      (more_fragments != 0 && payload_length % 8U != 0) ||
      (header_length + fragment_offset + payload_length > 65'535U);
  if (invalid_fragment) {
    context.mark_malformed();
    (void)context.add_unknown(*ip_node, payload, 0, payload_length);
    return {*total_length};
  }
  if (fragmented) {
    if (payload.captured_length() != payload_length) {
      (void)context.add_unknown(*ip_node, payload, 0, payload_length);
      return {*total_length};
    }
    auto reassembled = context.submit_ip_fragment(
        IpFamily::V4, *source, *destination, *protocol, *identification,
        fragment_offset, more_fragments != 0, payload);
    if (reassembled.overlap &&
        !context.add_unsigned(state.fragment_overlap, *ip_node, view, 0, 0, 1,
                              ParsedNodeFlagGenerated)) {
      return {};
    }
    if (reassembled.status == ReassemblyStatus::Complete) {
      if (!context.add_unsigned(state.reassembled, *ip_node, view, 0, 0, 1,
                                ParsedNodeFlagGenerated) ||
          !context.add_unsigned(state.reassembled_length, *ip_node, view, 0, 0,
                                reassembled.bytes.size(),
                                ParsedNodeFlagGenerated) ||
          !context.add_unsigned(state.reassembled_fragment_count, *ip_node,
                                view, 0, 0, reassembled.part_count,
                                ParsedNodeFlagGenerated)) {
        return {};
      }
      const auto source_id = context.add_derived_source(
          "Reassembled IPv4 payload", reassembled.bytes,
          reassembled.contributors);
      if (!source_id) {
        return {};
      }
      const auto reassembled_view = PacketView::from_capture(
          reassembled.bytes, reassembled.bytes.size(), *source_id);
      if (!context.push_network_layer(IpFamily::V4, *source, *destination)) {
        return {};
      }
      (void)context.dispatch_ip_protocol(IpFamily::V4, *protocol,
                                         reassembled_view, *ip_node);
      context.pop_network_layer();
      return {*total_length};
    }
    if (reassembled.status == ReassemblyStatus::Conflict ||
        reassembled.status == ReassemblyStatus::Invalid) {
      context.mark_malformed();
    }
    (void)context.add_unknown(*ip_node, payload, 0, payload_length);
    if (reassembled.status == ReassemblyStatus::ResourceLimit) {
      context.mark_resource_limit();
    }
    return {*total_length};
  }
  if (!context.push_network_layer(IpFamily::V4, *source, *destination)) {
    return {};
  }
  (void)context.dispatch_ip_protocol(IpFamily::V4, *protocol, payload,
                                     *ip_node);
  context.pop_network_layer();
  return {*total_length};
}

} // namespace pruftnet::parsing::internal

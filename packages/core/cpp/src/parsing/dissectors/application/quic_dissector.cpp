#include "parsing/dissectors/application/quic_dissector.hpp"

#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <limits>
#include <optional>
#include <span>

#include "parsing/dissector_context.hpp"

namespace pruftnet::parsing::internal {
namespace {

constexpr std::uint32_t kQuicVersion1 = 0x00000001;
constexpr std::uint32_t kQuicVersion2 = 0x6b3343cf;
constexpr std::size_t kMaximumConnectionIdLength = 20;
constexpr std::size_t kRetryIntegrityTagLength = 16;

enum class PacketType : std::uint8_t {
  Initial = 0,
  ZeroRtt = 1,
  Handshake = 2,
  Retry = 3,
  VersionNegotiation = 4,
  Short = 5,
  UnknownVersion = 6,
};

struct VariableInteger {
  std::uint64_t value = 0;
  std::size_t length = 0;
};

struct LongPacket {
  std::uint8_t first = 0;
  std::uint8_t type_bits = 0;
  std::uint32_t version = 0;
  PacketType type = PacketType::UnknownVersion;
  std::size_t destination_length_offset = 5;
  std::size_t destination_offset = 6;
  std::size_t destination_length = 0;
  std::size_t source_length_offset = 0;
  std::size_t source_offset = 0;
  std::size_t source_length = 0;
  std::size_t common_end = 0;
  std::size_t token_length_offset = 0;
  VariableInteger token_length;
  std::size_t token_offset = 0;
  std::size_t length_offset = 0;
  VariableInteger payload_length;
  std::size_t protected_offset = 0;
  std::size_t packet_length = 0;
};

std::optional<VariableInteger> read_variable_integer(DissectorContext &context,
                                                     const PacketView &view,
                                                     std::size_t offset) {
  const auto first = context.read(view.read_u8(offset));
  if (!first) {
    return std::nullopt;
  }
  const auto length = std::size_t{1} << (*first >> 6U);
  if (length > view.reported_length() - offset) {
    context.mark_malformed();
    return std::nullopt;
  }
  const auto encoded = context.read(view.read_bytes(offset, length));
  if (!encoded) {
    return std::nullopt;
  }
  std::uint64_t value = std::to_integer<std::uint8_t>((*encoded)[0]) & 0x3fU;
  for (std::size_t index = 1; index < length; ++index) {
    value = (value << 8U) | std::to_integer<std::uint8_t>((*encoded)[index]);
  }
  return VariableInteger{value, length};
}

PacketType packet_type(std::uint32_t version, std::uint8_t type_bits) {
  if (version == kQuicVersion2) {
    switch (type_bits) {
    case 0:
      return PacketType::Retry;
    case 1:
      return PacketType::Initial;
    case 2:
      return PacketType::ZeroRtt;
    case 3:
      return PacketType::Handshake;
    default:
      break;
    }
  } else if (version == kQuicVersion1) {
    return static_cast<PacketType>(type_bits);
  }
  return PacketType::UnknownVersion;
}

std::optional<LongPacket> scan_long_packet(DissectorContext &context,
                                           const PacketView &view) {
  if (view.reported_length() < 7) {
    context.mark_malformed();
    return std::nullopt;
  }
  const auto first = context.read(view.read_u8(0));
  const auto version = context.read(view.read_be32(1));
  const auto destination_length = context.read(view.read_u8(5));
  if (!first || !version || !destination_length) {
    return std::nullopt;
  }

  LongPacket packet;
  packet.first = *first;
  packet.type_bits = static_cast<std::uint8_t>((*first >> 4U) & 0x03U);
  packet.version = *version;
  packet.destination_length = *destination_length;
  if ((*version == kQuicVersion1 || *version == kQuicVersion2) &&
      packet.destination_length > kMaximumConnectionIdLength) {
    context.mark_malformed();
    return std::nullopt;
  }
  if (packet.destination_length >
      view.reported_length() - packet.destination_offset) {
    context.mark_malformed();
    return std::nullopt;
  }

  packet.source_length_offset =
      packet.destination_offset + packet.destination_length;
  const auto source_length =
      context.read(view.read_u8(packet.source_length_offset));
  if (!source_length) {
    return std::nullopt;
  }
  packet.source_length = *source_length;
  if ((*version == kQuicVersion1 || *version == kQuicVersion2) &&
      packet.source_length > kMaximumConnectionIdLength) {
    context.mark_malformed();
    return std::nullopt;
  }
  packet.source_offset = packet.source_length_offset + 1;
  if (packet.source_length > view.reported_length() - packet.source_offset) {
    context.mark_malformed();
    return std::nullopt;
  }
  packet.common_end = packet.source_offset + packet.source_length;

  if (*version == 0) {
    packet.type = PacketType::VersionNegotiation;
    packet.packet_length = view.reported_length();
    const auto versions_length = packet.packet_length - packet.common_end;
    if (versions_length == 0 || versions_length % 4U != 0) {
      context.mark_malformed();
      return std::nullopt;
    }
    return packet;
  }

  packet.type = packet_type(*version, packet.type_bits);
  if (packet.type == PacketType::UnknownVersion) {
    packet.packet_length = view.reported_length();
    return packet;
  }
  if (packet.type == PacketType::Retry) {
    packet.packet_length = view.reported_length();
    if (packet.packet_length - packet.common_end <= kRetryIntegrityTagLength) {
      context.mark_malformed();
      return std::nullopt;
    }
    return packet;
  }

  std::size_t offset = packet.common_end;
  if (packet.type == PacketType::Initial) {
    packet.token_length_offset = offset;
    const auto token_length = read_variable_integer(context, view, offset);
    if (!token_length) {
      return std::nullopt;
    }
    packet.token_length = *token_length;
    offset += token_length->length;
    packet.token_offset = offset;
    if (token_length->value >
        static_cast<std::uint64_t>(view.reported_length() - offset)) {
      context.mark_malformed();
      return std::nullopt;
    }
    offset += static_cast<std::size_t>(token_length->value);
  }

  packet.length_offset = offset;
  const auto payload_length = read_variable_integer(context, view, offset);
  if (!payload_length) {
    return std::nullopt;
  }
  packet.payload_length = *payload_length;
  offset += payload_length->length;
  packet.protected_offset = offset;
  if (payload_length->value == 0 ||
      payload_length->value >
          static_cast<std::uint64_t>(view.reported_length() - offset) ||
      payload_length->value >
          std::numeric_limits<std::size_t>::max() - offset) {
    context.mark_malformed();
    return std::nullopt;
  }
  packet.packet_length =
      offset + static_cast<std::size_t>(payload_length->value);
  return packet;
}

bool add_bytes_if_present(DissectorContext &context, FieldId field,
                          std::uint32_t parent, const PacketView &view,
                          std::size_t offset, std::size_t length) {
  if (length == 0 || offset >= view.captured_length()) {
    return true;
  }
  const auto captured = std::min(length, view.captured_length() - offset);
  return context.add_bytes(field, parent, view, offset,
                           view.captured().subspan(offset, captured));
}

bool add_common_long_fields(DissectorContext &context,
                            const QuicDissectorState &state,
                            const PacketView &packet_view, std::uint32_t node,
                            const LongPacket &packet, std::size_t index) {
  return context
             .add_unsigned(state.packet_type, node, packet_view, 0, 1,
                           static_cast<std::uint8_t>(packet.type))
             .has_value() &&
         context
             .add_unsigned(state.packet_length, node, packet_view, 0, 0,
                           packet.packet_length, ParsedNodeFlagGenerated)
             .has_value() &&
         context
             .add_unsigned(state.coalesced_index, node, packet_view, 0, 0,
                           index, ParsedNodeFlagGenerated)
             .has_value() &&
         context.add_unsigned(state.header_form, node, packet_view, 0, 1, 1)
             .has_value() &&
         context
             .add_unsigned(state.fixed_bit, node, packet_view, 0, 1,
                           (packet.first >> 6U) & 0x01U)
             .has_value() &&
         context
             .add_unsigned(state.long_packet_type_bits, node, packet_view, 0, 1,
                           packet.type_bits)
             .has_value() &&
         context
             .add_unsigned(state.type_specific_bits, node, packet_view, 0, 1,
                           packet.first & 0x0fU)
             .has_value() &&
         context
             .add_unsigned(state.version, node, packet_view, 1, 4,
                           packet.version)
             .has_value() &&
         context
             .add_unsigned(state.destination_connection_id_length, node,
                           packet_view, packet.destination_length_offset, 1,
                           packet.destination_length)
             .has_value() &&
         add_bytes_if_present(context, state.destination_connection_id, node,
                              packet_view, packet.destination_offset,
                              packet.destination_length) &&
         context
             .add_unsigned(state.source_connection_id_length, node, packet_view,
                           packet.source_length_offset, 1, packet.source_length)
             .has_value() &&
         add_bytes_if_present(context, state.source_connection_id, node,
                              packet_view, packet.source_offset,
                              packet.source_length);
}

bool render_long_packet(DissectorContext &context,
                        const QuicDissectorState &state, const PacketView &view,
                        std::uint32_t parent, const LongPacket &packet,
                        std::size_t index) {
  const auto packet_view =
      view.subview(0, packet.packet_length, packet.packet_length);
  if (!packet_view.has_value()) {
    context.mark_malformed();
    return false;
  }
  if (packet_view.value()->captured_length() < packet.packet_length) {
    context.mark_partial();
  }
  const auto node =
      context.add_protocol(state.packet, parent, *packet_view.value(),
                           packet_view.value()->captured_length());
  if (!node || !add_common_long_fields(context, state, *packet_view.value(),
                                       *node, packet, index)) {
    return false;
  }

  if (packet.type == PacketType::VersionNegotiation) {
    for (std::size_t offset = packet.common_end; offset < packet.packet_length;
         offset += 4) {
      const auto version = context.read(packet_view.value()->read_be32(offset));
      if (!version ||
          !context.add_unsigned(state.supported_version, *node,
                                *packet_view.value(), offset, 4, *version)) {
        return false;
      }
    }
    return true;
  }
  if (packet.type == PacketType::UnknownVersion) {
    return add_bytes_if_present(context, state.version_specific_data, *node,
                                *packet_view.value(), packet.common_end,
                                packet.packet_length - packet.common_end);
  }
  if (packet.type == PacketType::Retry) {
    const auto token_length =
        packet.packet_length - packet.common_end - kRetryIntegrityTagLength;
    return add_bytes_if_present(context, state.retry_token, *node,
                                *packet_view.value(), packet.common_end,
                                token_length) &&
           add_bytes_if_present(
               context, state.retry_integrity_tag, *node, *packet_view.value(),
               packet.common_end + token_length, kRetryIntegrityTagLength);
  }

  if (packet.type == PacketType::Initial &&
      (!context
            .add_unsigned(state.token_length, *node, *packet_view.value(),
                          packet.token_length_offset,
                          packet.token_length.length, packet.token_length.value)
            .has_value() ||
       !add_bytes_if_present(
           context, state.token, *node, *packet_view.value(),
           packet.token_offset,
           static_cast<std::size_t>(packet.token_length.value)))) {
    return false;
  }
  return context
             .add_unsigned(state.length, *node, *packet_view.value(),
                           packet.length_offset, packet.payload_length.length,
                           packet.payload_length.value)
             .has_value() &&
         add_bytes_if_present(
             context, state.protected_payload, *node, *packet_view.value(),
             packet.protected_offset,
             static_cast<std::size_t>(packet.payload_length.value));
}

bool render_short_packet(DissectorContext &context,
                         const QuicDissectorState &state,
                         const PacketView &view, std::uint32_t parent,
                         std::uint8_t first, std::size_t index) {
  const auto node =
      context.add_protocol(state.packet, parent, view, view.captured_length());
  if (!node) {
    return false;
  }
  return context
             .add_unsigned(state.packet_type, *node, view, 0, 1,
                           static_cast<std::uint8_t>(PacketType::Short))
             .has_value() &&
         context
             .add_unsigned(state.packet_length, *node, view, 0, 0,
                           view.reported_length(), ParsedNodeFlagGenerated)
             .has_value() &&
         context
             .add_unsigned(state.coalesced_index, *node, view, 0, 0, index,
                           ParsedNodeFlagGenerated)
             .has_value() &&
         context.add_unsigned(state.header_form, *node, view, 0, 1, 0)
             .has_value() &&
         context
             .add_unsigned(state.fixed_bit, *node, view, 0, 1,
                           (first >> 6U) & 0x01U)
             .has_value() &&
         context
             .add_unsigned(state.spin_bit, *node, view, 0, 1,
                           (first >> 5U) & 0x01U)
             .has_value() &&
         context
             .add_unsigned(state.short_protected_bits, *node, view, 0, 1,
                           first & 0x1fU)
             .has_value() &&
         add_bytes_if_present(context, state.protected_payload, *node, view, 1,
                              view.reported_length() - 1);
}

} // namespace

DissectionResult dissect_quic(DissectorContext &context, const void *opaque,
                              const PacketView &view, std::uint32_t parent) {
  const auto &state = *static_cast<const QuicDissectorState *>(opaque);
  if (view.reported_length() == 0) {
    context.mark_malformed();
    return {};
  }

  std::size_t offset = 0;
  std::size_t index = 0;
  while (offset < view.reported_length() && !context.stopped()) {
    const auto remaining_length = view.reported_length() - offset;
    const auto remaining =
        view.subview(offset, remaining_length, remaining_length);
    if (!remaining.has_value()) {
      context.mark_malformed();
      break;
    }
    if (remaining.value()->captured_length() == 0) {
      context.mark_partial();
      break;
    }
    const auto first = context.read(remaining.value()->read_u8(0));
    if (!first) {
      break;
    }
    if ((*first & 0x80U) == 0) {
      (void)render_short_packet(context, state, *remaining.value(), parent,
                                *first, index);
      offset = view.reported_length();
      break;
    }

    const auto packet = scan_long_packet(context, *remaining.value());
    if (!packet) {
      break;
    }
    if (!render_long_packet(context, state, *remaining.value(), parent, *packet,
                            index)) {
      break;
    }
    offset += packet->packet_length;
    ++index;
    if (packet->type == PacketType::Retry ||
        packet->type == PacketType::VersionNegotiation ||
        packet->type == PacketType::UnknownVersion ||
        remaining.value()->captured_length() < packet->packet_length) {
      break;
    }
  }
  return {view.reported_length()};
}

} // namespace pruftnet::parsing::internal

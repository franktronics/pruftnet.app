#include "parsing/dissectors/stp_dissector.hpp"

#include <cstddef>

#include "parsing/dissector_context.hpp"
#include "parsing/dissectors/dissector_states.hpp"

namespace pruftnet::parsing::internal {
namespace {

constexpr std::uint8_t kConfigurationType = 0x00;
constexpr std::uint8_t kRapidType = 0x02;
constexpr std::uint8_t kTopologyChangeType = 0x80;
constexpr std::size_t kTopologyChangeLength = 4;
constexpr std::size_t kConfigurationLength = 35;
constexpr std::size_t kRapidLength = 36;
constexpr std::size_t kMstParametersOffset = 38;
constexpr std::size_t kMstFixedParametersLength = 64;
constexpr std::size_t kMstiLength = 16;

bool add_bridge_identifier(DissectorContext &context, const PacketView &view,
                           std::uint32_t parent, std::size_t offset,
                           FieldId priority_field, FieldId system_id_field,
                           FieldId mac_field) {
  const auto identifier = context.read(view.read_be16(offset));
  const auto mac = context.read(view.read_bytes(offset + 2, 6));
  return identifier && mac &&
         context
             .add_unsigned(priority_field, parent, view, offset, 2,
                           *identifier & 0xf000U)
             .has_value() &&
         context
             .add_unsigned(system_id_field, parent, view, offset, 2,
                           *identifier & 0x0fffU)
             .has_value() &&
         context.add_bytes(mac_field, parent, view, offset + 2, *mac);
}

bool dissect_mstp(DissectorContext &context, const StpDissectorState &state,
                  const PacketView &view, std::uint32_t parent,
                  std::uint16_t version_3_length) {
  if (version_3_length < kMstFixedParametersLength ||
      (version_3_length - kMstFixedParametersLength) % kMstiLength != 0) {
    context.mark_malformed();
    return context.add_unknown(parent, view, kMstParametersOffset,
                               view.reported_length() - kMstParametersOffset);
  }
  const auto logical_length =
      kMstParametersOffset + static_cast<std::size_t>(version_3_length);
  if (logical_length > view.reported_length()) {
    context.mark_malformed();
    return context.add_unknown(parent, view, kMstParametersOffset,
                               view.reported_length() - kMstParametersOffset);
  }
  const auto extension_result =
      view.subview(36, 2 + static_cast<std::size_t>(version_3_length),
                   2 + static_cast<std::size_t>(version_3_length));
  if (!extension_result.has_value()) {
    context.mark_malformed();
    return false;
  }
  const auto &extension = *extension_result.value();
  const auto mstp = context.add_protocol(
      state.mstp.extension, parent, extension, extension.captured_length());
  if (!mstp || !context.add_unsigned(state.mstp.version_3_length, *mstp,
                                     extension, 0, 2, version_3_length)) {
    return false;
  }

  const auto format = context.read(extension.read_u8(2));
  const auto name = context.read(extension.read_bytes(3, 32));
  const auto revision = context.read(extension.read_be16(35));
  const auto digest = context.read(extension.read_bytes(37, 16));
  const auto internal_cost = context.read(extension.read_be32(53));
  const auto remaining_hops = context.read(extension.read_u8(65));
  if (!format || !name || !revision || !digest || !internal_cost ||
      !remaining_hops ||
      !context.add_unsigned(state.mstp.config_format_selector, *mstp, extension,
                            2, 1, *format) ||
      !context.add_bytes(state.mstp.config_name, *mstp, extension, 3, *name) ||
      !context.add_unsigned(state.mstp.config_revision, *mstp, extension, 35, 2,
                            *revision) ||
      !context.add_bytes(state.mstp.config_digest, *mstp, extension, 37,
                         *digest) ||
      !context.add_unsigned(state.mstp.cist_internal_root_path_cost, *mstp,
                            extension, 53, 4, *internal_cost) ||
      !add_bridge_identifier(context, extension, *mstp, 57,
                             state.mstp.cist_bridge_priority,
                             state.mstp.cist_bridge_system_id_extension,
                             state.mstp.cist_bridge_mac) ||
      !context.add_unsigned(state.mstp.cist_remaining_hops, *mstp, extension,
                            65, 1, *remaining_hops)) {
    return false;
  }

  const auto instance_count =
      (static_cast<std::size_t>(version_3_length) - kMstFixedParametersLength) /
      kMstiLength;
  for (std::size_t index = 0; index < instance_count; ++index) {
    const auto offset = 66 + index * kMstiLength;
    const auto instance_result =
        extension.subview(offset, kMstiLength, kMstiLength);
    if (!instance_result.has_value()) {
      context.mark_malformed();
      return false;
    }
    const auto &instance = *instance_result.value();
    const auto instance_node = context.add_protocol(
        state.mstp.instance, *mstp, instance, instance.captured_length());
    const auto flags = context.read(instance.read_u8(0));
    const auto root_identifier = context.read(instance.read_be16(1));
    const auto root_mac = context.read(instance.read_bytes(3, 6));
    const auto root_cost = context.read(instance.read_be32(9));
    const auto bridge_priority = context.read(instance.read_u8(13));
    const auto port_priority = context.read(instance.read_u8(14));
    const auto hops = context.read(instance.read_u8(15));
    if (!instance_node || !flags || !root_identifier || !root_mac ||
        !root_cost || !bridge_priority || !port_priority || !hops ||
        !context.add_unsigned(state.mstp.instance_flags, *instance_node,
                              instance, 0, 1, *flags) ||
        !context.add_unsigned(state.mstp.instance_root_priority, *instance_node,
                              instance, 1, 2, *root_identifier & 0xf000U) ||
        !context.add_unsigned(state.mstp.instance_id, *instance_node, instance,
                              1, 2, *root_identifier & 0x0fffU) ||
        !context.add_bytes(state.mstp.instance_regional_root_mac,
                           *instance_node, instance, 3, *root_mac) ||
        !context.add_unsigned(state.mstp.instance_internal_root_path_cost,
                              *instance_node, instance, 9, 4, *root_cost) ||
        !context.add_unsigned(state.mstp.instance_bridge_priority,
                              *instance_node, instance, 13, 1,
                              *bridge_priority >> 4U) ||
        !context.add_unsigned(state.mstp.instance_port_priority, *instance_node,
                              instance, 14, 1, *port_priority >> 4U) ||
        !context.add_unsigned(state.mstp.instance_remaining_hops,
                              *instance_node, instance, 15, 1, *hops)) {
      return false;
    }
  }
  return true;
}

} // namespace

DissectionResult dissect_stp(DissectorContext &context, const void *opaque,
                             const PacketView &view, std::uint32_t parent) {
  const auto &state = *static_cast<const StpDissectorState *>(opaque);
  const auto packet =
      context.add_protocol(state.packet, parent, view, view.captured_length());
  if (!packet || context.stopped()) {
    return {};
  }
  const auto protocol_identifier = context.read(view.read_be16(0));
  const auto version = context.read(view.read_u8(2));
  const auto type = context.read(view.read_u8(3));
  if (!protocol_identifier || !version || !type ||
      !context.add_unsigned(state.protocol_identifier, *packet, view, 0, 2,
                            *protocol_identifier) ||
      !context.add_unsigned(state.version, *packet, view, 2, 1, *version) ||
      !context.add_unsigned(state.type, *packet, view, 3, 1, *type)) {
    return {};
  }
  if (*protocol_identifier != 0) {
    context.mark_malformed();
  }
  if (*type == kTopologyChangeType) {
    if (*version != 0) {
      context.mark_malformed();
    }
    return {kTopologyChangeLength};
  }
  if (*type != kConfigurationType && *type != kRapidType) {
    if (view.reported_length() > 4) {
      (void)context.add_bytes(state.body, *packet, view, 4,
                              view.captured().subspan(std::min<std::size_t>(
                                  4, view.captured_length())));
    }
    return {view.reported_length()};
  }
  if ((*type == kConfigurationType && *version != 0) ||
      (*type == kRapidType && *version < 2)) {
    context.mark_malformed();
  }

  const auto flags = context.read(view.read_u8(4));
  const auto root_cost = context.read(view.read_be32(13));
  const auto port_id = context.read(view.read_be16(25));
  const auto message_age = context.read(view.read_be16(27));
  const auto max_age = context.read(view.read_be16(29));
  const auto hello_time = context.read(view.read_be16(31));
  const auto forward_delay = context.read(view.read_be16(33));
  if (!flags || !root_cost || !port_id || !message_age || !max_age ||
      !hello_time || !forward_delay ||
      !context.add_unsigned(state.flags, *packet, view, 4, 1, *flags) ||
      !add_bridge_identifier(context, view, *packet, 5, state.root_priority,
                             state.root_system_id_extension, state.root_mac) ||
      !context.add_unsigned(state.root_path_cost, *packet, view, 13, 4,
                            *root_cost) ||
      !add_bridge_identifier(context, view, *packet, 17, state.bridge_priority,
                             state.bridge_system_id_extension,
                             state.bridge_mac) ||
      !context.add_unsigned(state.port_id, *packet, view, 25, 2, *port_id) ||
      !context.add_unsigned(state.message_age, *packet, view, 27, 2,
                            *message_age) ||
      !context.add_unsigned(state.max_age, *packet, view, 29, 2, *max_age) ||
      !context.add_unsigned(state.hello_time, *packet, view, 31, 2,
                            *hello_time) ||
      !context.add_unsigned(state.forward_delay, *packet, view, 33, 2,
                            *forward_delay)) {
    return {};
  }
  if (*type == kConfigurationType) {
    return {kConfigurationLength};
  }

  const auto version_1_length = context.read(view.read_u8(35));
  if (!version_1_length ||
      !context.add_unsigned(state.version_1_length, *packet, view, 35, 1,
                            *version_1_length)) {
    return {};
  }
  if (*version == 2) {
    return {kRapidLength};
  }
  if (*version_1_length != 0) {
    context.mark_malformed();
    return {kRapidLength};
  }
  const auto version_3_length = context.read(view.read_be16(36));
  if (!version_3_length) {
    return {};
  }
  const auto logical_length =
      kMstParametersOffset + static_cast<std::size_t>(*version_3_length);
  if (!dissect_mstp(context, state, view, *packet, *version_3_length)) {
    return {};
  }
  return {logical_length <= view.reported_length() ? logical_length
                                                   : view.reported_length()};
}

} // namespace pruftnet::parsing::internal

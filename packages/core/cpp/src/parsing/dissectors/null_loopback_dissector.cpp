#include "parsing/dissectors/null_loopback_dissector.hpp"

#include <algorithm>

#include "parsing/dissector_context.hpp"
#include "parsing/dissectors/dissector_states.hpp"

namespace pruftnet::parsing::internal {
namespace {

constexpr std::size_t kHeaderLength = 4;
constexpr std::uint32_t kMaximumBsdFamily = 1500;

bool is_known_family(std::uint32_t value) noexcept {
  return value == 2 || value == 24 || value == 28 || value == 30;
}

bool is_plausible_family(std::uint32_t value) noexcept { return value <= 255; }

bool is_plausible_ethertype(std::uint32_t value) noexcept {
  return value > kMaximumBsdFamily && value <= 0xffffU;
}

std::uint32_t normalize_null_header(std::uint32_t big_endian,
                                    std::uint32_t little_endian) noexcept {
  if (is_known_family(little_endian)) {
    return little_endian;
  }
  if (is_known_family(big_endian)) {
    return big_endian;
  }
  if ((big_endian & 0xffffU) == 0 && is_plausible_family(big_endian >> 16U)) {
    return big_endian >> 16U;
  }
  if ((little_endian & 0xffffU) == 0 &&
      is_plausible_family(little_endian >> 16U)) {
    return little_endian >> 16U;
  }
  if (is_plausible_family(little_endian) != is_plausible_family(big_endian)) {
    return is_plausible_family(little_endian) ? little_endian : big_endian;
  }
  if (is_plausible_ethertype(little_endian) !=
      is_plausible_ethertype(big_endian)) {
    return is_plausible_ethertype(little_endian) ? little_endian : big_endian;
  }
  return little_endian;
}

} // namespace

DissectionResult dissect_null_loopback(DissectorContext &context,
                                       const void *opaque,
                                       const PacketView &view,
                                       std::uint32_t parent) {
  const auto &state = *static_cast<const NullLoopbackDissectorState *>(opaque);
  const auto loopback =
      context.add_protocol(state.packet, parent, view, view.captured_length());
  if (!loopback || context.stopped()) {
    return {};
  }
  const auto big_endian = context.read(view.read_be32(0));
  if (!big_endian) {
    return {};
  }
  std::uint32_t family = *big_endian;
  if (!state.network_byte_order) {
    const auto little_endian = context.read(view.read_le32(0));
    if (!little_endian) {
      return {};
    }
    family = normalize_null_header(*big_endian, *little_endian);
  }

  const auto payload_length = view.reported_length() - kHeaderLength;
  const auto payload_result =
      view.subview(kHeaderLength, payload_length, payload_length);
  if (!payload_result.has_value()) {
    context.mark_malformed();
    return {};
  }
  const auto &payload = *payload_result.value();
  DissectionResult child;
  if (is_plausible_ethertype(family)) {
    if (!context.add_unsigned(state.type, *loopback, view, 0, 4, family)) {
      return {};
    }
    child = context.dispatch_ethertype(static_cast<std::uint16_t>(family),
                                       payload, *loopback);
  } else {
    if (!context.add_unsigned(state.family, *loopback, view, 0, 4, family)) {
      return {};
    }
    child = context.dispatch_null_family(family, payload, *loopback);
  }
  if (context.stopped()) {
    return {};
  }
  if (child.consumed_length < payload_length) {
    (void)context.add_unknown(*loopback, payload, child.consumed_length,
                              payload_length - child.consumed_length);
  }
  return {view.reported_length()};
}

} // namespace pruftnet::parsing::internal

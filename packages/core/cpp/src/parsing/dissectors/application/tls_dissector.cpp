#include "parsing/dissectors/application/tls_dissector.hpp"

#include <algorithm>
#include <array>
#include <cstddef>
#include <cstdint>
#include <span>
#include <string>
#include <vector>

#include "parsing/dissector_context.hpp"
#include "parsing/dissectors/shared/dissector_utils.hpp"

namespace pruftnet::parsing::internal {
namespace {

constexpr std::size_t kRecordHeaderLength = 5;
constexpr std::size_t kMaximumCiphertextLength = (1U << 14U) + 256U;
constexpr std::size_t kHandshakeHeaderLength = 4;
constexpr std::uint64_t kCiphertextAfterChangeCipherSpec = 1U;

std::uint16_t be16(std::span<const std::byte> bytes,
                   std::size_t offset) noexcept {
  return static_cast<std::uint16_t>(
      (std::to_integer<std::uint8_t>(bytes[offset]) << 8U) |
      std::to_integer<std::uint8_t>(bytes[offset + 1]));
}

std::uint32_t be24(std::span<const std::byte> bytes,
                   std::size_t offset) noexcept {
  return (std::to_integer<std::uint8_t>(bytes[offset]) << 16U) |
         (std::to_integer<std::uint8_t>(bytes[offset + 1]) << 8U) |
         std::to_integer<std::uint8_t>(bytes[offset + 2]);
}

bool add_string_bytes(DissectorContext &context, FieldId field,
                      std::uint32_t parent, const PacketView &view,
                      std::size_t offset, std::size_t length) {
  const auto value = escaped_ascii(view.captured().subspan(offset, length));
  return context.add_string(field, parent, view, offset, length, value);
}

bool parse_server_name(DissectorContext &context,
                       const TlsDissectorState &state, const PacketView &data,
                       std::uint32_t parent, bool client) {
  if (!client) {
    if (data.reported_length() != 0) {
      context.mark_malformed();
      return false;
    }
    return true;
  }
  if (data.reported_length() < 2) {
    context.mark_malformed();
    return false;
  }
  const auto list_length = be16(data.captured(), 0);
  if (list_length == 0 || list_length != data.reported_length() - 2) {
    context.mark_malformed();
    return false;
  }
  std::array<bool, 256> seen_types{};
  std::size_t offset = 2;
  while (offset < data.reported_length()) {
    if (data.reported_length() - offset < 3) {
      context.mark_malformed();
      return false;
    }
    const auto name_type =
        std::to_integer<std::uint8_t>(data.captured()[offset]);
    const auto length = be16(data.captured(), offset + 1);
    if (seen_types[name_type] || length == 0 ||
        length > data.reported_length() - offset - 3) {
      context.mark_malformed();
      return false;
    }
    seen_types[name_type] = true;
    if (!context.add_unsigned(state.server_name_type, parent, data, offset, 1,
                              name_type) ||
        !add_string_bytes(context, state.server_name, parent, data, offset + 3,
                          length)) {
      return false;
    }
    offset += 3 + length;
  }
  return true;
}

bool parse_u16_vector(DissectorContext &context, FieldId field,
                      const PacketView &data, std::uint32_t parent) {
  if (data.reported_length() < 2) {
    context.mark_malformed();
    return false;
  }
  const auto length = be16(data.captured(), 0);
  if (length < 2 || length != data.reported_length() - 2 || length % 2U != 0) {
    context.mark_malformed();
    return false;
  }
  for (std::size_t offset = 2; offset < data.reported_length(); offset += 2) {
    if (!context.add_unsigned(field, parent, data, offset, 2,
                              be16(data.captured(), offset))) {
      return false;
    }
  }
  return true;
}

bool parse_supported_versions(DissectorContext &context,
                              const TlsDissectorState &state,
                              const PacketView &data, std::uint32_t parent,
                              bool client) {
  if (client) {
    if (data.reported_length() < 1) {
      context.mark_malformed();
      return false;
    }
    const auto length = std::to_integer<std::uint8_t>(data.captured()[0]);
    if (length < 2 || length != data.reported_length() - 1 ||
        length % 2U != 0) {
      context.mark_malformed();
      return false;
    }
    for (std::size_t offset = 1; offset < data.reported_length(); offset += 2) {
      if (!context.add_unsigned(state.supported_version, parent, data, offset,
                                2, be16(data.captured(), offset))) {
        return false;
      }
    }
    return true;
  }
  if (data.reported_length() != 2) {
    context.mark_malformed();
    return false;
  }
  return context
      .add_unsigned(state.supported_version, parent, data, 0, 2,
                    be16(data.captured(), 0))
      .has_value();
}

bool parse_alpn(DissectorContext &context, const TlsDissectorState &state,
                const PacketView &data, std::uint32_t parent, bool client) {
  if (data.reported_length() < 2) {
    context.mark_malformed();
    return false;
  }
  const auto length = be16(data.captured(), 0);
  if (length != data.reported_length() - 2) {
    context.mark_malformed();
    return false;
  }
  std::size_t offset = 2;
  std::size_t protocol_count = 0;
  while (offset < data.reported_length()) {
    const auto name_length =
        std::to_integer<std::uint8_t>(data.captured()[offset]);
    if (name_length == 0 || name_length > data.reported_length() - offset - 1) {
      context.mark_malformed();
      return false;
    }
    if (!add_string_bytes(context, state.alpn, parent, data, offset + 1,
                          name_length)) {
      return false;
    }
    offset += 1 + name_length;
    ++protocol_count;
  }
  if (protocol_count == 0 || (!client && protocol_count != 1)) {
    context.mark_malformed();
    return false;
  }
  return true;
}

bool parse_extensions(DissectorContext &context, const TlsDissectorState &state,
                      const PacketView &body, std::uint32_t parent,
                      std::size_t offset, bool client) {
  if (offset == body.reported_length()) {
    return true;
  }
  if (body.reported_length() - offset < 2) {
    context.mark_malformed();
    return false;
  }
  const auto total_length = be16(body.captured(), offset);
  if (!context.add_unsigned(state.extensions_length, parent, body, offset, 2,
                            total_length)) {
    return false;
  }
  offset += 2;
  if (total_length != body.reported_length() - offset) {
    context.mark_malformed();
    return false;
  }
  const auto end = offset + total_length;
  std::vector<std::uint16_t> seen_types;
  seen_types.reserve(total_length / 4U);
  while (offset < end) {
    if (end - offset < 4) {
      context.mark_malformed();
      return false;
    }
    const auto type = be16(body.captured(), offset);
    const auto length = be16(body.captured(), offset + 2);
    if (std::find(seen_types.begin(), seen_types.end(), type) !=
            seen_types.end() ||
        length > end - offset - 4) {
      context.mark_malformed();
      return false;
    }
    seen_types.push_back(type);
    const auto extension_view = body.subview(offset, 4 + length);
    const auto data_view = body.subview(offset + 4, length);
    if (!extension_view.has_value() || !data_view.has_value()) {
      context.mark_malformed();
      return false;
    }
    const auto extension =
        context.add_protocol(state.extension, parent, *extension_view.value(),
                             extension_view.value()->captured_length());
    if (!extension ||
        !context.add_unsigned(state.extension_type, *extension, body, offset, 2,
                              type) ||
        !context.add_unsigned(state.extension_length, *extension, body,
                              offset + 2, 2, length) ||
        (length != 0 &&
         !context.add_bytes(state.extension_data, *extension, body, offset + 4,
                            body.captured().subspan(offset + 4, length)))) {
      return false;
    }
    bool parsed = true;
    switch (type) {
    case 0:
      parsed = parse_server_name(context, state, *data_view.value(), *extension,
                                 client);
      break;
    case 10:
      parsed = parse_u16_vector(context, state.supported_group,
                                *data_view.value(), *extension);
      break;
    case 13:
      parsed = parse_u16_vector(context, state.signature_algorithm,
                                *data_view.value(), *extension);
      break;
    case 16:
      parsed =
          parse_alpn(context, state, *data_view.value(), *extension, client);
      break;
    case 43:
      parsed = parse_supported_versions(context, state, *data_view.value(),
                                        *extension, client);
      break;
    default:
      break;
    }
    if (!parsed) {
      return false;
    }
    offset += 4 + length;
  }
  return true;
}

bool parse_client_hello(DissectorContext &context,
                        const TlsDissectorState &state, const PacketView &body,
                        std::uint32_t parent) {
  if (body.reported_length() < 35) {
    context.mark_malformed();
    return false;
  }
  const auto session_length =
      std::to_integer<std::uint8_t>(body.captured()[34]);
  if (session_length > 32 || session_length > body.reported_length() - 35) {
    context.mark_malformed();
    return false;
  }
  if (!context.add_unsigned(state.handshake_version, parent, body, 0, 2,
                            be16(body.captured(), 0)) ||
      !context.add_bytes(state.random, parent, body, 2,
                         body.captured().subspan(2, 32)) ||
      (session_length != 0 &&
       !context.add_bytes(state.session_id, parent, body, 35,
                          body.captured().subspan(35, session_length)))) {
    return false;
  }
  std::size_t offset = 35 + session_length;
  if (body.reported_length() - offset < 2) {
    context.mark_malformed();
    return false;
  }
  const auto suites_length = be16(body.captured(), offset);
  if (suites_length < 2 || suites_length % 2U != 0 ||
      suites_length > body.reported_length() - offset - 2 ||
      !context.add_unsigned(state.cipher_suites_length, parent, body, offset, 2,
                            suites_length)) {
    context.mark_malformed();
    return false;
  }
  offset += 2;
  for (std::size_t end = offset + suites_length; offset < end; offset += 2) {
    if (!context.add_unsigned(state.cipher_suite, parent, body, offset, 2,
                              be16(body.captured(), offset))) {
      return false;
    }
  }
  if (offset >= body.reported_length()) {
    context.mark_malformed();
    return false;
  }
  const auto compression_length =
      std::to_integer<std::uint8_t>(body.captured()[offset]);
  if (compression_length == 0 ||
      compression_length > body.reported_length() - offset - 1 ||
      !context.add_unsigned(state.compression_methods_length, parent, body,
                            offset, 1, compression_length)) {
    context.mark_malformed();
    return false;
  }
  ++offset;
  for (const auto end = offset + compression_length; offset < end; ++offset) {
    if (!context.add_unsigned(
            state.compression_method, parent, body, offset, 1,
            std::to_integer<std::uint8_t>(body.captured()[offset]))) {
      return false;
    }
  }
  return parse_extensions(context, state, body, parent, offset, true);
}

bool parse_server_hello(DissectorContext &context,
                        const TlsDissectorState &state, const PacketView &body,
                        std::uint32_t parent) {
  if (body.reported_length() < 38) {
    context.mark_malformed();
    return false;
  }
  const auto session_length =
      std::to_integer<std::uint8_t>(body.captured()[34]);
  if (session_length > 32 || session_length > body.reported_length() - 38) {
    context.mark_malformed();
    return false;
  }
  if (!context.add_unsigned(state.handshake_version, parent, body, 0, 2,
                            be16(body.captured(), 0)) ||
      !context.add_bytes(state.random, parent, body, 2,
                         body.captured().subspan(2, 32)) ||
      (session_length != 0 &&
       !context.add_bytes(state.session_id, parent, body, 35,
                          body.captured().subspan(35, session_length)))) {
    return false;
  }
  std::size_t offset = 35 + session_length;
  if (body.reported_length() - offset < 3 ||
      !context.add_unsigned(state.cipher_suite, parent, body, offset, 2,
                            be16(body.captured(), offset)) ||
      !context.add_unsigned(
          state.compression_method, parent, body, offset + 2, 1,
          std::to_integer<std::uint8_t>(body.captured()[offset + 2]))) {
    context.mark_malformed();
    return false;
  }
  offset += 3;
  return parse_extensions(context, state, body, parent, offset, false);
}

bool render_handshake_messages(DissectorContext &context,
                               const TlsDissectorState &state,
                               const PacketView &handshake,
                               std::uint32_t parent, std::size_t record_count,
                               bool &complete) {
  complete = true;
  std::size_t offset = 0;
  while (offset < handshake.reported_length()) {
    if (handshake.reported_length() - offset < kHandshakeHeaderLength) {
      complete = false;
      return true;
    }
    const auto type =
        std::to_integer<std::uint8_t>(handshake.captured()[offset]);
    const auto length = be24(handshake.captured(), offset + 1);
    if (length >
        handshake.reported_length() - offset - kHandshakeHeaderLength) {
      complete = false;
      return true;
    }
    const auto message_view =
        handshake.subview(offset, kHandshakeHeaderLength + length);
    const auto body_view =
        handshake.subview(offset + kHandshakeHeaderLength, length);
    if (!message_view.has_value() || !body_view.has_value()) {
      context.mark_malformed();
      return false;
    }
    const auto message =
        context.add_protocol(state.handshake, parent, *message_view.value(),
                             message_view.value()->captured_length());
    if (!message ||
        !context.add_unsigned(state.handshake_type, *message, handshake, offset,
                              1, type) ||
        !context.add_unsigned(state.handshake_length, *message, handshake,
                              offset + 1, 3, length) ||
        (record_count > 1 &&
         !context.add_unsigned(state.handshake_reassembled, *message, handshake,
                               offset, 0, 1, ParsedNodeFlagGenerated))) {
      return false;
    }
    bool parsed = true;
    if (type == 1) {
      parsed = parse_client_hello(context, state, *body_view.value(), *message);
    } else if (type == 2) {
      parsed = parse_server_hello(context, state, *body_view.value(), *message);
    } else if (length != 0) {
      parsed = context.add_bytes(state.handshake_body, *message, handshake,
                                 offset + kHandshakeHeaderLength,
                                 handshake.captured().subspan(
                                     offset + kHandshakeHeaderLength, length));
    }
    if (!parsed) {
      return false;
    }
    offset += kHandshakeHeaderLength + length;
  }
  return true;
}

bool render_record(DissectorContext &context, const TlsDissectorState &state,
                   const PacketView &view, std::uint32_t parent,
                   std::size_t offset, std::uint8_t content_type,
                   std::uint16_t version, std::size_t length) {
  const auto record_view = view.subview(offset, kRecordHeaderLength + length);
  if (!record_view.has_value()) {
    context.mark_malformed();
    return false;
  }
  const auto record =
      context.add_protocol(state.record, parent, *record_view.value(),
                           record_view.value()->captured_length());
  if (!record ||
      !context.add_unsigned(state.content_type, *record, view, offset, 1,
                            content_type) ||
      !context.add_unsigned(state.legacy_version, *record, view, offset + 1, 2,
                            version) ||
      !context.add_unsigned(state.record_length, *record, view, offset + 3, 2,
                            length)) {
    return false;
  }
  if (length != 0 &&
      !context.add_bytes(
          state.record_payload, *record, view, offset + kRecordHeaderLength,
          view.captured().subspan(offset + kRecordHeaderLength, length))) {
    return false;
  }
  const auto payload = view.subview(offset + kRecordHeaderLength, length);
  if (!payload.has_value()) {
    context.mark_malformed();
    return false;
  }
  if (content_type == 20 && length == 1) {
    const auto value =
        std::to_integer<std::uint8_t>(payload.value()->captured()[0]);
    if (value != 1) {
      context.mark_malformed();
      return false;
    }
    return context
        .add_unsigned(state.change_cipher_spec, *record, *payload.value(), 0, 1,
                      value)
        .has_value();
  }
  if (content_type == 21 && length == 2) {
    const auto alert =
        context.add_protocol(state.alert, *record, *payload.value(),
                             payload.value()->captured_length());
    return alert &&
           context
               .add_unsigned(state.alert_level, *alert, *payload.value(), 0, 1,
                             std::to_integer<std::uint8_t>(
                                 payload.value()->captured()[0]))
               .has_value() &&
           context
               .add_unsigned(state.alert_description, *alert, *payload.value(),
                             1, 1,
                             std::to_integer<std::uint8_t>(
                                 payload.value()->captured()[1]))
               .has_value();
  }
  if (content_type == 24 && length >= 3) {
    const auto declared = be16(payload.value()->captured(), 1);
    if (declared > length - 3) {
      context.mark_malformed();
      return false;
    }
    const auto heartbeat =
        context.add_protocol(state.heartbeat, *record, *payload.value(),
                             payload.value()->captured_length());
    return heartbeat &&
           context
               .add_unsigned(state.heartbeat_type, *heartbeat, *payload.value(),
                             0, 1,
                             std::to_integer<std::uint8_t>(
                                 payload.value()->captured()[0]))
               .has_value() &&
           context
               .add_unsigned(state.heartbeat_length, *heartbeat,
                             *payload.value(), 1, 2, declared)
               .has_value() &&
           (declared == 0 ||
            context.add_bytes(
                state.heartbeat_payload, *heartbeat, *payload.value(), 3,
                payload.value()->captured().subspan(3, declared)));
  }
  return true;
}

struct HandshakeGroup {
  std::vector<std::byte> bytes;
  std::vector<ParsedContributor> contributors;
  std::size_t stream_start = 0;
  std::size_t stream_end = 0;
  std::size_t record_count = 0;

  void clear() {
    bytes.clear();
    contributors.clear();
    stream_start = 0;
    stream_end = 0;
    record_count = 0;
  }

  [[nodiscard]] bool empty() const noexcept { return record_count == 0; }
};

bool flush_handshakes(DissectorContext &context, const TlsDissectorState &state,
                      std::uint32_t parent, HandshakeGroup &group,
                      std::size_t &safe_consumed, bool &incomplete) {
  incomplete = false;
  if (group.empty()) {
    return true;
  }
  const auto source = context.add_derived_source(
      "Reassembled TLS handshake", group.bytes, group.contributors);
  if (!source) {
    return false;
  }
  const auto handshake =
      PacketView::from_capture(group.bytes, group.bytes.size(), *source);
  bool complete = false;
  if (!render_handshake_messages(context, state, handshake, parent,
                                 group.record_count, complete)) {
    return false;
  }
  if (!complete) {
    incomplete = true;
    return true;
  }
  safe_consumed = group.stream_end;
  group.clear();
  return true;
}

} // namespace

DissectionResult dissect_tls(DissectorContext &context, const void *opaque,
                             const PacketView &view, std::uint32_t parent) {
  const auto &state = *static_cast<const TlsDissectorState *>(opaque);
  const auto stream =
      context.add_protocol(state.stream, parent, view, view.captured_length());
  if (!stream || context.stopped()) {
    return {};
  }

  std::size_t offset = 0;
  std::size_t safe_consumed = 0;
  bool ciphertext =
      (context.tcp_application_state() & kCiphertextAfterChangeCipherSpec) != 0;
  HandshakeGroup handshakes;
  while (offset < view.captured_length()) {
    if (view.captured_length() - offset < kRecordHeaderLength) {
      (void)context.add_bytes(state.trailing, *stream, view, offset,
                              view.captured().subspan(offset));
      break;
    }
    const auto content_type =
        std::to_integer<std::uint8_t>(view.captured()[offset]);
    const auto version = be16(view.captured(), offset + 1);
    const auto length = be16(view.captured(), offset + 3);
    if (content_type < 20 || content_type > 24 ||
        (version & 0xff00U) != 0x0300U || length > kMaximumCiphertextLength) {
      context.mark_malformed();
      return {view.captured_length()};
    }
    if (length > view.captured_length() - offset - kRecordHeaderLength) {
      (void)context.add_bytes(state.trailing, *stream, view, offset,
                              view.captured().subspan(offset));
      break;
    }

    if ((content_type != 22 || ciphertext) && !handshakes.empty()) {
      bool incomplete = false;
      if (!flush_handshakes(context, state, *stream, handshakes, safe_consumed,
                            incomplete)) {
        return {safe_consumed};
      }
      if (incomplete) {
        return {safe_consumed};
      }
    }
    if (!render_record(context, state, view, *stream, offset, content_type,
                       version, length)) {
      return {safe_consumed};
    }

    const auto record_end = offset + kRecordHeaderLength + length;
    if (content_type == 22 && !ciphertext) {
      if (handshakes.empty()) {
        handshakes.stream_start = offset;
      }
      const auto destination_offset = handshakes.bytes.size();
      const auto payload =
          view.captured().subspan(offset + kRecordHeaderLength, length);
      handshakes.bytes.insert(handshakes.bytes.end(), payload.begin(),
                              payload.end());
      auto contributors =
          context.contributors_for(view, offset + kRecordHeaderLength, length);
      for (auto &contributor : contributors) {
        contributor.destination_offset +=
            static_cast<std::uint32_t>(destination_offset);
        handshakes.contributors.push_back(contributor);
      }
      handshakes.stream_end = record_end;
      ++handshakes.record_count;
    } else {
      safe_consumed = record_end;
      if (content_type == 20 && length == 1) {
        ciphertext = true;
        if (!context.set_tcp_application_state(
                context.tcp_application_state() |
                kCiphertextAfterChangeCipherSpec)) {
          context.mark_resource_limit();
          return {safe_consumed};
        }
      }
    }
    offset = record_end;
  }

  bool incomplete = false;
  if (!flush_handshakes(context, state, *stream, handshakes, safe_consumed,
                        incomplete)) {
    return {safe_consumed};
  }
  return {safe_consumed};
}

} // namespace pruftnet::parsing::internal

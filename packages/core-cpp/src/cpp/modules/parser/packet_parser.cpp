#include "packet_parser.hpp"

ParsedPacket PacketParser::parsePacket(const RawPacket &raw_packet) {
  ParsedPacket parsed;
  parsed.protocol_count = 0;
  parsed.valid = false;

  if (!raw_packet.valid || raw_packet.length == 0) {
    return parsed;
  }

  parseProtocol(raw_packet, parsed, ProtocolId::ETHERNET, 0);
  parsed.valid = parsed.protocol_count > 0;

  return parsed;
}

void PacketParser::parseProtocol(const RawPacket &raw_packet,
                                 ParsedPacket &parsed, ProtocolId protocol_id,
                                 size_t offset_bytes) {
  if (parsed.protocol_count >= MAX_PROTOCOLS_PER_PACKET) {
    return;
  }

  if (protocol_id == ProtocolId::UNKNOWN) {
    return;
  }

  const ProtocolDefinition *def = getProtocolDefinition(protocol_id);
  if (!def) {
    return;
  }

  if (offset_bytes + def->header_size_bytes > raw_packet.length) {
    return;
  }

  ProtocolEntry &entry = parsed.protocols[parsed.protocol_count];
  entry.protocol_id = protocol_id;
  entry.header_offset = static_cast<uint16_t>(offset_bytes);
  entry.field_count = def->field_count;

  for (uint8_t i = 0; i < def->field_count && i < MAX_FIELDS_PER_PROTOCOL;
       ++i) {
    const FieldDefinition &field_def = def->fields[i];
    FieldEntry &field = entry.fields[i];

    field.field_id = field_def.field_id;
    field.byte_offset =
        static_cast<uint16_t>(offset_bytes + (field_def.bit_offset / 8));
    field.byte_length = static_cast<uint8_t>((field_def.bit_length + 7) / 8);
  }

  parsed.protocol_count++;

  ProtocolId next_protocol =
      determineNextProtocol(raw_packet, def, offset_bytes);
  size_t next_offset = offset_bytes + def->header_size_bytes;

  if (protocol_id == ProtocolId::IPV4) {
    uint8_t ihl = raw_packet.data[offset_bytes] & 0x0F;
    next_offset = offset_bytes + (ihl * 4);
  }

  if (next_protocol != ProtocolId::UNKNOWN && next_offset < raw_packet.length) {
    parseProtocol(raw_packet, parsed, next_protocol, next_offset);
  }
}

ProtocolId PacketParser::determineNextProtocol(const RawPacket &raw_packet,
                                               const ProtocolDefinition *def,
                                               size_t header_offset_bytes) {
  if (!def || def->next_protocol_field_id == 255) {
    return ProtocolId::UNKNOWN;
  }

  // Find the next_protocol field and extract its value
  for (uint8_t i = 0; i < def->field_count; ++i) {
    if (def->fields[i].field_id == def->next_protocol_field_id) {
      uint32_t value = extractFieldValue(raw_packet, header_offset_bytes,
                                         def->fields[i].bit_offset,
                                         def->fields[i].bit_length);
      return lookupNextProtocol(def, value);
    }
  }

  return ProtocolId::UNKNOWN;
}

uint32_t PacketParser::extractFieldValue(const RawPacket &raw_packet,
                                         size_t header_offset_bytes,
                                         uint16_t bit_offset,
                                         uint16_t bit_length) {
  size_t byte_offset = header_offset_bytes + (bit_offset / 8);
  uint8_t bit_shift = bit_offset % 8;

  if (byte_offset >= raw_packet.length) {
    return 0;
  }

  uint32_t value = 0;
  size_t bytes_needed = (bit_shift + bit_length + 7) / 8;

  for (size_t i = 0; i < bytes_needed && (byte_offset + i) < raw_packet.length;
       ++i) {
    value = (value << 8) | raw_packet.data[byte_offset + i];
  }

  size_t total_bits = bytes_needed * 8;
  size_t right_shift = total_bits - bit_shift - bit_length;
  value >>= right_shift;

  uint32_t mask = (1U << bit_length) - 1;
  if (bit_length == 32) {
    mask = 0xFFFFFFFF;
  }

  return value & mask;
}

#pragma once

#include "parsing/dissector.hpp"
#include "pruftnet/parsing/registry.hpp"

namespace pruftnet::parsing::internal {

struct TlsDissectorState {
  FieldId stream;
  FieldId record;
  FieldId content_type;
  FieldId legacy_version;
  FieldId record_length;
  FieldId record_payload;
  FieldId alert;
  FieldId alert_level;
  FieldId alert_description;
  FieldId change_cipher_spec;
  FieldId heartbeat;
  FieldId heartbeat_type;
  FieldId heartbeat_length;
  FieldId heartbeat_payload;
  FieldId handshake;
  FieldId handshake_type;
  FieldId handshake_length;
  FieldId handshake_version;
  FieldId random;
  FieldId session_id;
  FieldId cipher_suites_length;
  FieldId cipher_suite;
  FieldId compression_methods_length;
  FieldId compression_method;
  FieldId extensions_length;
  FieldId extension;
  FieldId extension_type;
  FieldId extension_length;
  FieldId extension_data;
  FieldId server_name_type;
  FieldId server_name;
  FieldId alpn;
  FieldId supported_group;
  FieldId signature_algorithm;
  FieldId supported_version;
  FieldId handshake_body;
  FieldId handshake_reassembled;
  FieldId trailing;
};

DissectionResult dissect_tls(DissectorContext &, const void *,
                             const PacketView &, std::uint32_t);

} // namespace pruftnet::parsing::internal

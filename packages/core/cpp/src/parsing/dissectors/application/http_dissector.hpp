#pragma once

#include "parsing/dissector.hpp"
#include "pruftnet/parsing/registry.hpp"

namespace pruftnet::parsing::internal {

struct HttpDissectorState {
  FieldId stream;
  FieldId message;
  FieldId request;
  FieldId response;
  FieldId request_line;
  FieldId response_line;
  FieldId method;
  FieldId request_target;
  FieldId version;
  FieldId status_code;
  FieldId reason_phrase;
  FieldId header;
  FieldId header_name;
  FieldId header_value;
  FieldId host;
  FieldId user_agent;
  FieldId content_type;
  FieldId content_length;
  FieldId transfer_encoding;
  FieldId connection;
  FieldId body;
  FieldId chunk;
  FieldId chunk_size;
  FieldId chunk_extension;
  FieldId chunk_data;
  FieldId trailing;
};

DissectionResult dissect_http(DissectorContext &, const void *,
                              const PacketView &, std::uint32_t);

} // namespace pruftnet::parsing::internal

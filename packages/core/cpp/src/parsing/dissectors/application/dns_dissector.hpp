#pragma once

#include "parsing/dissector.hpp"
#include "pruftnet/parsing/registry.hpp"

namespace pruftnet::parsing::internal {

enum class DnsFlavor : std::uint8_t {
  Dns,
  Mdns,
  Llmnr,
};

struct DnsDissectorState {
  FieldId message;
  FieldId tcp_stream;
  FieldId tcp_length;
  FieldId id;
  FieldId flags;
  FieldId response;
  FieldId opcode;
  FieldId authoritative;
  FieldId truncated;
  FieldId recursion_desired;
  FieldId recursion_available;
  FieldId authenticated_data;
  FieldId checking_disabled;
  FieldId rcode;
  FieldId conflict;
  FieldId tentative;
  FieldId question_count;
  FieldId answer_count;
  FieldId authority_count;
  FieldId additional_count;
  FieldId question;
  FieldId question_name;
  FieldId question_type;
  FieldId question_class;
  FieldId unicast_response;
  FieldId record;
  FieldId record_section;
  FieldId record_name;
  FieldId record_type;
  FieldId record_class;
  FieldId cache_flush;
  FieldId ttl;
  FieldId record_length;
  FieldId record_data;
  FieldId address;
  FieldId target;
  FieldId preference;
  FieldId priority;
  FieldId weight;
  FieldId port;
  FieldId text;
  FieldId soa_mname;
  FieldId soa_rname;
  FieldId soa_serial;
  FieldId soa_refresh;
  FieldId soa_retry;
  FieldId soa_expire;
  FieldId soa_minimum;
  FieldId edns_udp_payload_size;
  FieldId edns_extended_rcode;
  FieldId edns_version;
  FieldId edns_flags;
  FieldId edns_option;
  FieldId edns_option_code;
  FieldId edns_option_length;
  FieldId edns_option_data;
  FieldId trailing;
  DnsFlavor flavor;
  bool tcp;
};

DissectionResult dissect_dns(DissectorContext &, const void *,
                             const PacketView &, std::uint32_t);

} // namespace pruftnet::parsing::internal

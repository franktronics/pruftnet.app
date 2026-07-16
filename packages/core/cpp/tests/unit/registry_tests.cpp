#include <cassert>
#include <functional>
#include <string>
#include <variant>

#include "pruftnet/parsing/registry.hpp"

namespace {

using namespace pruftnet::parsing;

template <typename Value>
const Value &value(const RegistryResult<Value> &result) {
  assert(std::holds_alternative<Value>(result));
  return std::get<Value>(result);
}

template <typename Value>
RegistryError error(const RegistryResult<Value> &result) {
  assert(std::holds_alternative<RegistryError>(result));
  return std::get<RegistryError>(result);
}

RegistrySnapshot registry_with_order(bool reverse_fields = false) {
  RegistryBuilder builder;
  const auto alpha_result = builder.register_protocol("alpha", "Alpha");
  const auto beta_result =
      builder.register_protocol("beta", "Beta", DescriptorVisibilityVisible);
  const ProtocolId alpha = value(alpha_result);
  const ProtocolId beta = value(beta_result);
  if (reverse_fields) {
    const auto second = builder.register_field(beta, "beta.enabled", "Enabled",
                                               FieldValueType::Boolean);
    const auto first = builder.register_field(alpha, "alpha.value", "Value",
                                              FieldValueType::Unsigned);
    assert(std::holds_alternative<FieldId>(second));
    assert(std::holds_alternative<FieldId>(first));
  } else {
    const auto first = builder.register_field(alpha, "alpha.value", "Value",
                                              FieldValueType::Unsigned);
    const auto second = builder.register_field(beta, "beta.enabled", "Enabled",
                                               FieldValueType::Boolean);
    assert(std::holds_alternative<FieldId>(first));
    assert(std::holds_alternative<FieldId>(second));
  }
  const auto frozen = builder.freeze();
  assert(std::holds_alternative<RegistrySnapshot>(frozen));
  return std::get<RegistrySnapshot>(frozen);
}

void ids_and_revision_are_deterministic() {
  const RegistrySnapshot first = registry_with_order();
  const RegistrySnapshot second = registry_with_order();
  const RegistrySnapshot reordered = registry_with_order(true);
  assert(first.protocols()[0].id == ProtocolId{1});
  assert(first.protocols()[1].id == ProtocolId{2});
  assert(first.fields()[0].id == FieldId{1});
  assert(first.fields()[1].id == FieldId{2});
  assert(first.revision().is_valid());
  assert(first.revision() == second.revision());
  assert(first.revision() != reordered.revision());
}

void registration_rejects_invalid_and_duplicate_keys() {
  RegistryBuilder builder;
  const auto invalid_empty = builder.register_protocol("", "Empty");
  const auto invalid_case = builder.register_protocol("Bad.Key", "Bad");
  const std::string invalid_utf8(1, static_cast<char>(0xFF));
  const auto invalid_name = builder.register_protocol("bad_name", invalid_utf8);
  const auto protocol_result = builder.register_protocol("valid_key", "Valid");
  const auto duplicate = builder.register_protocol("valid_key", "Duplicate");
  assert(error(invalid_empty).code == RegistryErrorCode::InvalidKey);
  assert(error(invalid_case).code == RegistryErrorCode::InvalidKey);
  assert(error(invalid_name).code == RegistryErrorCode::InvalidUtf8);
  assert(error(duplicate).code == RegistryErrorCode::DuplicateKey);

  const ProtocolId protocol = value(protocol_result);
  const auto field_result = builder.register_field(
      protocol, "valid.field", "Field", FieldValueType::String);
  const auto duplicate_field = builder.register_field(
      protocol, "valid.field", "Field", FieldValueType::Bytes);
  const auto unknown_owner = builder.register_field(
      ProtocolId{99}, "other.field", "Other", FieldValueType::Bytes);
  const auto invalid_type = builder.register_field(
      protocol, "valid.invalid", "Invalid", static_cast<FieldValueType>(255));
  assert(std::holds_alternative<FieldId>(field_result));
  assert(error(duplicate_field).code == RegistryErrorCode::DuplicateKey);
  assert(error(unknown_owner).code == RegistryErrorCode::UnknownProtocol);
  assert(error(invalid_type).code == RegistryErrorCode::InvalidValueType);
}

void freeze_and_lookup_errors_are_explicit() {
  RegistryBuilder empty;
  const auto empty_result = empty.freeze();
  assert(error(empty_result).code == RegistryErrorCode::Empty);

  RegistryBuilder builder;
  const auto protocol = builder.register_protocol("test", "Test");
  assert(std::holds_alternative<ProtocolId>(protocol));
  const auto snapshot_result = builder.freeze();
  assert(std::holds_alternative<RegistrySnapshot>(snapshot_result));
  const auto second_freeze = builder.freeze();
  const auto late_registration = builder.register_protocol("late", "Late");
  assert(error(second_freeze).code == RegistryErrorCode::Frozen);
  assert(error(late_registration).code == RegistryErrorCode::Frozen);

  const auto &snapshot = std::get<RegistrySnapshot>(snapshot_result);
  assert(value(snapshot.protocol(ProtocolId{1})).get().key == "test");
  assert(value(snapshot.protocol("test")).get().id == ProtocolId{1});
  assert(error(snapshot.protocol(ProtocolId{})).code ==
         RegistryErrorCode::UnknownProtocol);
  assert(error(snapshot.protocol("missing")).code ==
         RegistryErrorCode::UnknownProtocol);
  assert(error(snapshot.field(FieldId{})).code ==
         RegistryErrorCode::UnknownField);
  assert(error(snapshot.field("missing")).code ==
         RegistryErrorCode::UnknownField);
}

void bootstrap_registry_has_stable_parser_descriptors() {
  const auto core_result = make_core_registry();
  assert(std::holds_alternative<RegistrySnapshot>(core_result));
  const auto &core = std::get<RegistrySnapshot>(core_result);
  assert(core.protocols().size() == 38);
  assert(core.fields().size() == 649);
  assert(value(core.protocol("root")).get().display_name == "Root");
  assert(value(core.field("root.frame")).get().value_type ==
         FieldValueType::Protocol);
  assert(value(core.field("unknown.data")).get().value_type ==
         FieldValueType::Bytes);
  assert(value(core.field("diagnostics.message")).get().value_type ==
         FieldValueType::GeneratedText);
  assert(value(core.protocol("eth")).get().display_name == "Ethernet");
  assert(value(core.field("ipv4.total_length")).get().value_type ==
         FieldValueType::Unsigned);
  assert(value(core.field("ipv4.fragment_offset_encoded")).get().value_type ==
         FieldValueType::Unsigned);
  assert(value(core.field("ipv4.reassembled_length")).get().value_type ==
         FieldValueType::Unsigned);
  assert(value(core.field("udp.payload")).get().value_type ==
         FieldValueType::Bytes);
  assert(value(core.field("vlan.id")).get().value_type ==
         FieldValueType::Unsigned);
  assert(value(core.field("tcp.payload")).get().value_type ==
         FieldValueType::Bytes);
  assert(value(core.field("tcp.reassembled_length")).get().value_type ==
         FieldValueType::Unsigned);
  assert(value(core.field("arp.sender_hardware")).get().value_type ==
         FieldValueType::Bytes);
  assert(value(core.field("ipv6.flow_label")).get().value_type ==
         FieldValueType::Unsigned);
  assert(value(core.field("ipv6.fragment_atomic")).get().value_type ==
         FieldValueType::Unsigned);
  assert(
      value(core.field("ipv6.reassembled_fragment_count")).get().value_type ==
      FieldValueType::Unsigned);
  assert(value(core.field("icmpv6.option")).get().value_type ==
         FieldValueType::Protocol);
  assert(value(core.field("sll.interface_index")).get().value_type ==
         FieldValueType::Unsigned);
  assert(value(core.field("null.family")).get().value_type ==
         FieldValueType::Unsigned);
  assert(value(core.field("raw.packet")).get().value_type ==
         FieldValueType::Protocol);
  assert(value(core.field("eth.trailer")).get().value_type ==
         FieldValueType::Bytes);
  assert(value(core.field("vlan.trailer")).get().value_type ==
         FieldValueType::Bytes);
  assert(value(core.field("llc.control_length")).get().value_type ==
         FieldValueType::Unsigned);
  assert(value(core.field("snap.oui")).get().value_type ==
         FieldValueType::Unsigned);
  assert(value(core.field("lldp.system_name")).get().value_type ==
         FieldValueType::String);
  assert(value(core.field("stp.root.mac")).get().value_type ==
         FieldValueType::Bytes);
  assert(value(core.field("mstp.instance")).get().value_type ==
         FieldValueType::Protocol);
  assert(value(core.field("icmp.original_datagram_length")).get().value_type ==
         FieldValueType::Unsigned);
  assert(value(core.field("icmpv6.extended_sequence")).get().value_type ==
         FieldValueType::Unsigned);
  assert(value(core.field("icmp_ext.object")).get().value_type ==
         FieldValueType::Protocol);
  assert(value(core.field("icmp_ext.mpls_label")).get().value_type ==
         FieldValueType::Unsigned);
  assert(value(core.protocol("mdns")).get().display_name ==
         "Multicast Domain Name System");
  assert(value(core.field("dns.question.name")).get().value_type ==
         FieldValueType::String);
  assert(value(core.field("mdns.record.cache_flush")).get().value_type ==
         FieldValueType::Unsigned);
  assert(value(core.field("llmnr.tentative")).get().value_type ==
         FieldValueType::Unsigned);
  assert(value(core.field("dns.edns.option")).get().value_type ==
         FieldValueType::Protocol);
  assert(value(core.field("dhcp.client_hardware_address")).get().value_type ==
         FieldValueType::Bytes);
  assert(value(core.field("dhcp.option")).get().value_type ==
         FieldValueType::Protocol);
  assert(value(core.field("dhcp.host_name")).get().value_type ==
         FieldValueType::String);
  assert(value(core.field("dhcpv6.duid")).get().value_type ==
         FieldValueType::Protocol);
  assert(value(core.field("dhcpv6.prefix")).get().value_type ==
         FieldValueType::Bytes);
  assert(value(core.field("dhcpv6.status_message")).get().value_type ==
         FieldValueType::String);
  assert(value(core.field("igmp.record")).get().value_type ==
         FieldValueType::Protocol);
  assert(value(core.field("igmp.checksum_valid")).get().value_type ==
         FieldValueType::Unsigned);
  assert(value(core.field("mld.record.source_address")).get().value_type ==
         FieldValueType::Bytes);
  assert(value(core.field("ntp.poll")).get().value_type ==
         FieldValueType::Signed);
  assert(value(core.field("ntp.extension")).get().value_type ==
         FieldValueType::Protocol);
  assert(value(core.field("ntp.private.item_count")).get().value_type ==
         FieldValueType::Unsigned);
  assert(value(core.field("gre.routing_entry")).get().value_type ==
         FieldValueType::Protocol);
  assert(value(core.field("vxlan.vni")).get().value_type ==
         FieldValueType::Unsigned);
  assert(value(core.field("geneve.option.data")).get().value_type ==
         FieldValueType::Bytes);
  assert(value(core.field("mpls.gach")).get().value_type ==
         FieldValueType::Protocol);
  assert(value(core.field("rarp.packet")).get().value_type ==
         FieldValueType::Protocol);
  assert(value(core.field("inarp.packet")).get().value_type ==
         FieldValueType::Protocol);
  assert(value(core.field("http.chunk")).get().value_type ==
         FieldValueType::Protocol);
  assert(value(core.field("tls.handshake.server_name")).get().value_type ==
         FieldValueType::String);
  assert(value(core.field("quic.retry_integrity_tag")).get().value_type ==
         FieldValueType::Bytes);
}

} // namespace

int main() {
  ids_and_revision_are_deterministic();
  registration_rejects_invalid_and_duplicate_keys();
  freeze_and_lookup_errors_are_explicit();
  bootstrap_registry_has_stable_parser_descriptors();
  return 0;
}

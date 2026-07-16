#include "parsing/catalog/catalog_sections.hpp"

#include "parsing/dissectors/transport/tcp_dissector.hpp"
#include "parsing/dissectors/transport/udp_dissector.hpp"

namespace pruftnet::parsing::internal {

void register_transport_catalog(CatalogRegistrar &registrar) {
  const auto udp_handle = registrar.add_state(
      dissect_udp, UdpDissectorState{
                       registrar.field("udp.datagram"),
                       registrar.field("udp.source_port"),
                       registrar.field("udp.destination_port"),
                       registrar.field("udp.length"),
                       registrar.field("udp.checksum"),
                       registrar.field("udp.payload"),
                   });
  registrar.bind_ip_protocol(IpFamily::V4, 17, udp_handle);
  registrar.bind_ip_protocol(IpFamily::V6, 17, udp_handle);

  const auto tcp_handle = registrar.add_state(
      dissect_tcp, TcpDissectorState{
                       registrar.field("tcp.segment"),
                       registrar.field("tcp.source_port"),
                       registrar.field("tcp.destination_port"),
                       registrar.field("tcp.sequence_number"),
                       registrar.field("tcp.acknowledgment_number"),
                       registrar.field("tcp.header_length"),
                       registrar.field("tcp.reserved"),
                       registrar.field("tcp.flags"),
                       registrar.field("tcp.window"),
                       registrar.field("tcp.checksum"),
                       registrar.field("tcp.urgent_pointer"),
                       registrar.field("tcp.options"),
                       registrar.field("tcp.payload"),
                       registrar.field("tcp.reassembled"),
                       registrar.field("tcp.reassembled_length"),
                       registrar.field("tcp.reassembled_segment_count"),
                       registrar.field("tcp.reassembly_overlap"),
                       registrar.field("tcp.reassembly_conflict"),
                   });
  registrar.bind_ip_protocol(IpFamily::V4, 6, tcp_handle);
  registrar.bind_ip_protocol(IpFamily::V6, 6, tcp_handle);
}

} // namespace pruftnet::parsing::internal

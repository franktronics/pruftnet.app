#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <optional>
#include <span>
#include <string_view>
#include <vector>

#include "parsing/dissector.hpp"
#include "parsing/dissector_catalog.hpp"
#include "parsing/network_types.hpp"
#include "parsing/reassembly_store.hpp"
#include "pruftnet/parsing/packet_view.hpp"
#include "pruftnet/parsing/parsed_tree.hpp"
#include "pruftnet/sniffing/packet.hpp"

namespace pruftnet::parsing::internal {

class DissectorContext {
public:
  DissectorContext(const DissectorCatalog &catalog,
                   const sniffing::RawPacketView &packet, ParseBudget budget,
                   ParsedPacketTree storage, ReassemblyStore &reassembly);

  [[nodiscard]] std::optional<DataSourceId>
  add_source(std::span<const std::byte> bytes);
  [[nodiscard]] std::optional<DataSourceId>
  add_derived_source(std::string_view name, std::span<const std::byte> bytes,
                     std::span<const ParsedContributor> contributors);
  [[nodiscard]] std::optional<std::uint32_t>
  add_protocol(FieldId field, std::uint32_t parent, const PacketView &view,
               std::size_t length);
  [[nodiscard]] std::optional<std::uint32_t>
  add_unsigned(FieldId field, std::uint32_t parent, const PacketView &view,
               std::size_t offset, std::size_t length, std::uint64_t value,
               std::uint32_t flags = ParsedNodeFlagNone);
  [[nodiscard]] std::optional<std::uint32_t>
  add_signed(FieldId field, std::uint32_t parent, const PacketView &view,
             std::size_t offset, std::size_t length, std::int64_t value,
             std::uint32_t flags = ParsedNodeFlagNone);
  [[nodiscard]] bool add_bytes(FieldId field, std::uint32_t parent,
                               const PacketView &view, std::size_t offset,
                               std::span<const std::byte> value);
  [[nodiscard]] bool add_string(FieldId field, std::uint32_t parent,
                                const PacketView &view, std::size_t offset,
                                std::size_t length, std::string_view value);
  [[nodiscard]] bool add_unknown(std::uint32_t parent, const PacketView &view,
                                 std::size_t offset,
                                 std::size_t logical_length);
  [[nodiscard]] std::vector<ParsedContributor>
  contributors_for(const PacketView &view, std::size_t offset,
                   std::size_t length) const;

  [[nodiscard]] bool push_network_layer(IpFamily family,
                                        std::span<const std::byte> source,
                                        std::span<const std::byte> destination);
  void pop_network_layer() noexcept;
  [[nodiscard]] const NetworkLayerContext *network_layer() const noexcept;

  [[nodiscard]] ReassembledPayload
  submit_ip_fragment(IpFamily family, std::span<const std::byte> source,
                     std::span<const std::byte> destination,
                     std::uint8_t protocol, std::uint32_t identification,
                     std::size_t offset, bool more_fragments,
                     const PacketView &payload);
  [[nodiscard]] ReassembledPayload
  submit_tcp_segment(std::uint16_t source_port, std::uint16_t destination_port,
                     std::uint32_t sequence, bool syn,
                     const PacketView &payload);
  [[nodiscard]] bool consume_tcp_stream(std::uint16_t source_port,
                                        std::uint16_t destination_port,
                                        std::uint32_t sequence, bool syn,
                                        std::size_t length);
  void close_tcp_stream(std::uint16_t source_port,
                        std::uint16_t destination_port, std::uint32_t sequence,
                        bool syn) noexcept;
  void begin_tcp_application(std::uint16_t source_port,
                             std::uint16_t destination_port,
                             std::uint32_t sequence, bool syn) noexcept;
  void end_tcp_application() noexcept;
  [[nodiscard]] std::uint64_t tcp_application_state() const noexcept;
  [[nodiscard]] bool set_tcp_application_state(std::uint64_t state);
  void set_transport_end_of_stream(bool value) noexcept;
  [[nodiscard]] bool transport_end_of_stream() const noexcept;

  template <typename Value>
  [[nodiscard]] std::optional<Value> read(PacketReadResult<Value> result) {
    if (auto *value = std::get_if<Value>(&result)) {
      return std::move(*value);
    }
    const auto &failure = std::get<PacketReadError>(result);
    if (failure.code == PacketReadErrorCode::CaptureTruncated) {
      mark_partial();
    } else {
      mark_malformed();
    }
    return std::nullopt;
  }

  void mark_partial();
  void mark_malformed();
  void mark_resource_limit();
  [[nodiscard]] bool stopped() const noexcept;
  [[nodiscard]] const sniffing::RawPacketView &packet() const noexcept;
  [[nodiscard]] const CommonDissectorState &common() const noexcept;

  [[nodiscard]] DissectionResult dispatch_root(const PacketView &view,
                                               std::uint32_t parent) {
    return dispatch(catalog_.root(), view, parent);
  }
  [[nodiscard]] DissectionResult dispatch_dlt(std::uint32_t selector,
                                              const PacketView &view,
                                              std::uint32_t parent) {
    const auto handle = catalog_.dlt(selector);
    if (!handle) {
      (void)add_unknown(parent, view, 0, view.reported_length());
      return {view.reported_length()};
    }
    return dispatch(handle, view, parent);
  }
  [[nodiscard]] DissectionResult dispatch_ethernet(const PacketView &view,
                                                   std::uint32_t parent) {
    const auto handle = catalog_.ethernet();
    if (!handle) {
      (void)add_unknown(parent, view, 0, view.reported_length());
      return {view.reported_length()};
    }
    return dispatch(handle, view, parent);
  }
  [[nodiscard]] DissectionResult dispatch_ethertype(std::uint16_t selector,
                                                    const PacketView &view,
                                                    std::uint32_t parent) {
    const auto handle = catalog_.ethertype(selector);
    if (!handle) {
      (void)add_unknown(parent, view, 0, view.reported_length());
      return {view.reported_length()};
    }
    return dispatch(handle, view, parent);
  }
  [[nodiscard]] DissectionResult dispatch_ip_protocol(IpFamily family,
                                                      std::uint8_t selector,
                                                      const PacketView &view,
                                                      std::uint32_t parent) {
    const auto handle = catalog_.ip_protocol(family, selector);
    if (!handle) {
      (void)add_unknown(parent, view, 0, view.reported_length());
      return {view.reported_length()};
    }
    return dispatch(handle, view, parent);
  }
  [[nodiscard]] DissectionResult
  dispatch_sll_protocol(std::uint16_t hardware_type, std::uint16_t selector,
                        const PacketView &view, std::uint32_t parent) {
    const auto handle = catalog_.sll_protocol(hardware_type, selector);
    if (!handle) {
      (void)add_unknown(parent, view, 0, view.reported_length());
      return {view.reported_length()};
    }
    return dispatch(handle, view, parent);
  }
  [[nodiscard]] DissectionResult dispatch_null_family(std::uint32_t selector,
                                                      const PacketView &view,
                                                      std::uint32_t parent) {
    const auto handle = catalog_.null_family(selector);
    if (!handle) {
      (void)add_unknown(parent, view, 0, view.reported_length());
      return {view.reported_length()};
    }
    return dispatch(handle, view, parent);
  }
  [[nodiscard]] DissectionResult dispatch_llc(const PacketView &view,
                                              std::uint32_t parent) {
    const auto handle = catalog_.llc();
    if (!handle) {
      (void)add_unknown(parent, view, 0, view.reported_length());
      return {view.reported_length()};
    }
    return dispatch(handle, view, parent);
  }
  [[nodiscard]] DissectionResult dispatch_snap(bool information_frame,
                                               const PacketView &view,
                                               std::uint32_t parent) {
    const auto handle = catalog_.snap(information_frame);
    if (!handle) {
      (void)add_unknown(parent, view, 0, view.reported_length());
      return {view.reported_length()};
    }
    return dispatch(handle, view, parent);
  }
  [[nodiscard]] DissectionResult dispatch_llc_sap(std::uint8_t selector,
                                                  const PacketView &view,
                                                  std::uint32_t parent) {
    const auto handle = catalog_.llc_sap(selector);
    if (!handle) {
      (void)add_unknown(parent, view, 0, view.reported_length());
      return {view.reported_length()};
    }
    return dispatch(handle, view, parent);
  }
  [[nodiscard]] DissectionResult dispatch_snap_pid(std::uint32_t oui,
                                                   std::uint16_t pid,
                                                   const PacketView &view,
                                                   std::uint32_t parent) {
    const auto handle = catalog_.snap_pid(oui, pid);
    if (!handle) {
      (void)add_unknown(parent, view, 0, view.reported_length());
      return {view.reported_length()};
    }
    return dispatch(handle, view, parent);
  }
  [[nodiscard]] bool dispatch_udp_port(std::uint16_t source,
                                       std::uint16_t destination,
                                       const PacketView &view,
                                       std::uint32_t parent) {
    auto handle = catalog_.udp_port(destination);
    if (!handle) {
      handle = catalog_.udp_port(source);
    }
    if (!handle) {
      return false;
    }
    (void)dispatch(handle, view, parent);
    return true;
  }
  [[nodiscard]] bool has_tcp_dissector(std::uint16_t source,
                                       std::uint16_t destination) const {
    return static_cast<bool>(catalog_.tcp_port(destination)) ||
           static_cast<bool>(catalog_.tcp_port(source));
  }
  [[nodiscard]] std::optional<DissectionResult>
  dispatch_tcp_port(std::uint16_t source, std::uint16_t destination,
                    const PacketView &view, std::uint32_t parent) {
    auto handle = catalog_.tcp_port(destination);
    if (!handle) {
      handle = catalog_.tcp_port(source);
    }
    if (!handle) {
      return std::nullopt;
    }
    return dispatch(handle, view, parent);
  }
  [[nodiscard]] bool consume_dissector_call() {
    if (stopped_) {
      return false;
    }
    if (call_count_ >= budget_.max_dissector_calls) {
      mark_resource_limit();
      return false;
    }
    ++call_count_;
    return true;
  }
  [[nodiscard]] ParsedPacketTree finalize();

private:
  template <typename Value>
  [[nodiscard]] std::optional<Value> accept(TreeResult<Value> result);
  [[nodiscard]] DissectionResult dispatch(DissectorHandle handle,
                                          const PacketView &view,
                                          std::uint32_t parent) {
    if (stopped_) {
      return {};
    }
    if (!handle || call_count_ >= budget_.max_dissector_calls ||
        call_depth_ >= budget_.max_depth) {
      mark_resource_limit();
      return {};
    }
    ++call_count_;
    ++call_depth_;
    const auto result = handle.function(*this, handle.state, view, parent);
    --call_depth_;
    return result;
  }

  const DissectorCatalog &catalog_;
  const sniffing::RawPacketView &packet_;
  ParseBudget budget_;
  ParsedPacketTreeBuilder builder_;
  ReassemblyStore &reassembly_;
  static constexpr std::size_t kMaximumNetworkLayers = 32;
  std::array<NetworkLayerContext, kMaximumNetworkLayers> network_layers_{};
  std::size_t network_layer_count_ = 0;
  std::size_t call_count_ = 0;
  std::size_t call_depth_ = 0;
  std::optional<TcpSegmentInput> tcp_application_;
  bool transport_end_of_stream_ = false;
  bool stopped_ = false;
};

} // namespace pruftnet::parsing::internal

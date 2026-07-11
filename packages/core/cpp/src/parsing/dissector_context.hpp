#pragma once

#include <cstddef>
#include <cstdint>
#include <optional>
#include <span>

#include "parsing/dissector.hpp"
#include "parsing/dissector_catalog.hpp"
#include "pruftnet/parsing/packet_view.hpp"
#include "pruftnet/parsing/parsed_tree.hpp"
#include "pruftnet/sniffing/packet.hpp"

namespace pruftnet::parsing::internal {

class DissectorContext {
public:
    DissectorContext(const DissectorCatalog& catalog, const sniffing::RawPacketView& packet, ParseBudget budget,
                     ParsedPacketTree storage);

    [[nodiscard]] std::optional<DataSourceId> add_source(std::span<const std::byte> bytes);
    [[nodiscard]] std::optional<std::uint32_t> add_protocol(FieldId field, std::uint32_t parent,
                                                            const PacketView& view, std::size_t length);
    [[nodiscard]] std::optional<std::uint32_t> add_unsigned(FieldId field, std::uint32_t parent,
                                                            const PacketView& view, std::size_t offset,
                                                            std::size_t length, std::uint64_t value,
                                                            std::uint32_t flags = ParsedNodeFlagNone);
    [[nodiscard]] bool add_bytes(FieldId field, std::uint32_t parent, const PacketView& view, std::size_t offset,
                                 std::span<const std::byte> value);
    [[nodiscard]] bool add_unknown(std::uint32_t parent, const PacketView& view, std::size_t offset,
                                   std::size_t logical_length);

    template <typename Value> [[nodiscard]] std::optional<Value> read(PacketReadResult<Value> result) {
        if (auto* value = std::get_if<Value>(&result)) {
            return std::move(*value);
        }
        const auto& failure = std::get<PacketReadError>(result);
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
    [[nodiscard]] const sniffing::RawPacketView& packet() const noexcept;
    [[nodiscard]] const CommonDissectorState& common() const noexcept;

    [[nodiscard]] DissectionResult dispatch_root(const PacketView& view, std::uint32_t parent) {
        return dispatch(catalog_.root(), view, parent);
    }
    [[nodiscard]] DissectionResult dispatch_dlt(std::uint32_t selector, const PacketView& view,
                                                std::uint32_t parent) {
        const auto handle = catalog_.dlt(selector);
        if (!handle) {
            (void)add_unknown(parent, view, 0, view.reported_length());
            return {view.reported_length()};
        }
        return dispatch(handle, view, parent);
    }
    [[nodiscard]] DissectionResult dispatch_ethertype(std::uint16_t selector, const PacketView& view,
                                                      std::uint32_t parent) {
        const auto handle = catalog_.ethertype(selector);
        if (!handle) {
            (void)add_unknown(parent, view, 0, view.reported_length());
            return {view.reported_length()};
        }
        return dispatch(handle, view, parent);
    }
    [[nodiscard]] DissectionResult dispatch_ipv4_protocol(std::uint8_t selector, const PacketView& view,
                                                          std::uint32_t parent) {
        const auto handle = catalog_.ipv4_protocol(selector);
        if (!handle) {
            (void)add_unknown(parent, view, 0, view.reported_length());
            return {view.reported_length()};
        }
        return dispatch(handle, view, parent);
    }
    [[nodiscard]] ParsedPacketTree finalize();

private:
    template <typename Value> [[nodiscard]] std::optional<Value> accept(TreeResult<Value> result);
    [[nodiscard]] DissectionResult dispatch(DissectorHandle handle, const PacketView& view, std::uint32_t parent) {
        if (stopped_) {
            return {};
        }
        if (!handle || call_count_ >= budget_.max_dissector_calls || call_depth_ >= budget_.max_depth) {
            mark_resource_limit();
            return {};
        }
        ++call_count_;
        ++call_depth_;
        const auto result = handle.function(*this, handle.state, view, parent);
        --call_depth_;
        return result;
    }

    const DissectorCatalog& catalog_;
    const sniffing::RawPacketView& packet_;
    ParseBudget budget_;
    ParsedPacketTreeBuilder builder_;
    std::size_t call_count_ = 0;
    std::size_t call_depth_ = 0;
    bool stopped_ = false;
};

} // namespace pruftnet::parsing::internal

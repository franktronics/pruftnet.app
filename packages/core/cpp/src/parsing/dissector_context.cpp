#include "parsing/dissector_context.hpp"

#include <algorithm>
#include <stdexcept>
#include <utility>
#include <variant>

namespace pruftnet::parsing::internal {
namespace {

constexpr std::string_view kCapturedSourceName = "Captured frame";

bool is_resource_error(TreeBuildErrorCode code) noexcept {
    return code >= TreeBuildErrorCode::MaxNodes && code <= TreeBuildErrorCode::AllocationFailed;
}

} // namespace

DissectorContext::DissectorContext(const DissectorCatalog& catalog, const sniffing::RawPacketView& packet,
                                   ParseBudget budget, ParsedPacketTree storage)
    : catalog_(catalog), packet_(packet), budget_(budget),
      builder_(catalog_.registry(), packet.metadata.key, std::move(storage), budget) {}

std::optional<DataSourceId> DissectorContext::add_source(std::span<const std::byte> bytes) {
    return accept(builder_.add_data_source(kCapturedSourceName, bytes, DataSourceKind::Captured));
}

std::optional<std::uint32_t> DissectorContext::add_protocol(FieldId field, std::uint32_t parent,
                                                            const PacketView& view, std::size_t length) {
    return accept(builder_.add_none(field, parent, view.data_source_id(), view.absolute_offset(), length));
}

std::optional<std::uint32_t> DissectorContext::add_unsigned(FieldId field, std::uint32_t parent,
                                                            const PacketView& view, std::size_t offset,
                                                            std::size_t length, std::uint64_t value,
                                                            std::uint32_t flags) {
    return accept(builder_.add_unsigned(field, parent, view.data_source_id(), view.absolute_offset() + offset, length,
                                        value, flags));
}

bool DissectorContext::add_bytes(FieldId field, std::uint32_t parent, const PacketView& view, std::size_t offset,
                                 std::span<const std::byte> value) {
    return accept(builder_.add_source_bytes(field, parent, view.data_source_id(), view.absolute_offset() + offset,
                                            value.size()))
        .has_value();
}

bool DissectorContext::add_unknown(std::uint32_t parent, const PacketView& view, std::size_t offset,
                                   std::size_t logical_length) {
    if (offset > view.captured_length()) {
        return true;
    }
    const auto available = std::min(logical_length, view.captured_length() - offset);
    return add_bytes(common().unknown_data, parent, view, offset, view.captured().subspan(offset, available));
}

void DissectorContext::mark_partial() {
    if (builder_.condition() == ParseCondition::Complete) {
        (void)builder_.set_condition(ParseCondition::Partial);
    }
}

void DissectorContext::mark_malformed() {
    if (builder_.condition() != ParseCondition::ResourceLimit) {
        (void)builder_.set_condition(ParseCondition::Malformed);
    }
}

void DissectorContext::mark_resource_limit() {
    (void)builder_.set_condition(ParseCondition::ResourceLimit);
    stopped_ = true;
}

bool DissectorContext::stopped() const noexcept { return stopped_; }

const sniffing::RawPacketView& DissectorContext::packet() const noexcept { return packet_; }

const CommonDissectorState& DissectorContext::common() const noexcept { return catalog_.common(); }

ParsedPacketTree DissectorContext::finalize() {
    auto result = builder_.finalize();
    if (auto* tree = std::get_if<ParsedPacketTree>(&result)) {
        return std::move(*tree);
    }
    throw std::runtime_error("The packet parser could not finalize a structurally valid tree.");
}

template <typename Value> std::optional<Value> DissectorContext::accept(TreeResult<Value> result) {
    if (auto* value = std::get_if<Value>(&result)) {
        return std::move(*value);
    }
    const auto error = std::get<TreeBuildError>(result);
    if (is_resource_error(error.code)) {
        mark_resource_limit();
        return std::nullopt;
    }
    throw std::logic_error("A dissector attempted to construct an invalid tree node.");
}

template std::optional<std::uint32_t> DissectorContext::accept(TreeResult<std::uint32_t> result);

} // namespace pruftnet::parsing::internal

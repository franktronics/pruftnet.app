#include <array>
#include <cassert>
#include <cstddef>
#include <cstdint>
#include <limits>
#include <span>
#include <variant>

#include "pruftnet/parsing/packet_view.hpp"

namespace {

using pruftnet::parsing::PacketReadError;
using pruftnet::parsing::PacketReadErrorCode;
using pruftnet::parsing::PacketView;

constexpr std::array<std::byte, 16> kBytes{
    std::byte{0x01}, std::byte{0x23}, std::byte{0x45}, std::byte{0x67}, std::byte{0x89}, std::byte{0xAB},
    std::byte{0xCD}, std::byte{0xEF}, std::byte{0x10}, std::byte{0x32}, std::byte{0x54}, std::byte{0x76},
    std::byte{0x98}, std::byte{0xBA}, std::byte{0xDC}, std::byte{0xFE},
};

template <typename Value> Value value(const pruftnet::parsing::PacketReadResult<Value>& result) {
    assert(std::holds_alternative<Value>(result));
    return std::get<Value>(result);
}

template <typename Value> PacketReadError error(const pruftnet::parsing::PacketReadResult<Value>& result) {
    assert(std::holds_alternative<PacketReadError>(result));
    return std::get<PacketReadError>(result);
}

void root_view_preserves_lengths_and_source() {
    const auto view = PacketView::from_capture(kBytes, 32, 7);
    assert(view.captured().data() == kBytes.data());
    assert(view.captured_length() == kBytes.size());
    assert(view.reported_length() == 32);
    assert(view.contained_length() == 32);
    assert(view.absolute_offset() == 0);
    assert(view.data_source_id() == 7);
}

void endian_reads_are_correct() {
    const auto view = PacketView::from_capture(kBytes, kBytes.size());
    assert(value(view.read_u8(0)) == 0x01U);
    assert(value(view.read_be16(0)) == 0x0123U);
    assert(value(view.read_be32(0)) == 0x01234567U);
    assert(value(view.read_be64(0)) == 0x0123456789ABCDEFULL);
    assert(value(view.read_le16(0)) == 0x2301U);
    assert(value(view.read_le32(0)) == 0x67452301U);
    assert(value(view.read_le64(0)) == 0xEFCDAB8967452301ULL);
}

void capture_truncation_is_distinct() {
    const auto view = PacketView::from_capture(std::span(kBytes).first(8), 16);
    const auto read_error = error(view.read_be16(7));
    assert(read_error.code == PacketReadErrorCode::CaptureTruncated);
    assert(read_error.captured_length == 8);
    assert(read_error.reported_length == 16);
    assert(read_error.contained_length == 16);
}

void reported_length_is_enforced_before_capture_length() {
    const auto view = PacketView::from_capture(kBytes, 6);
    assert(view.captured_length() == 6);
    const auto read_error = error(view.read_be16(5));
    assert(read_error.code == PacketReadErrorCode::PastReportedLength);
}

void child_view_preserves_parent_boundary() {
    const auto root = PacketView::from_capture(kBytes, kBytes.size(), 3);
    const auto child_result = root.subview(4, 4, 12);
    assert(child_result.has_value());
    const auto* child = child_result.value();
    assert(child != nullptr);
    assert(child->captured_length() == 4);
    assert(child->reported_length() == 12);
    assert(child->contained_length() == 4);
    assert(child->absolute_offset() == 4);
    assert(child->data_source_id() == 3);

    const auto read_error = error(child->read_be16(3));
    assert(read_error.code == PacketReadErrorCode::PastParentBoundary);
}

void child_capture_is_capped_by_its_reported_length() {
    const auto root = PacketView::from_capture(kBytes, kBytes.size());
    const auto child_result = root.subview(0, 12, 4);
    assert(child_result.has_value());
    const auto* child = child_result.value();
    assert(child != nullptr);
    assert(child->captured_length() == 4);
    assert(child->reported_length() == 4);
    assert(child->contained_length() == 12);
}

void subviews_are_zero_copy_and_accumulate_offsets() {
    const auto root = PacketView::from_capture(kBytes, kBytes.size(), 9);
    const auto child_result = root.subview(4, 8);
    assert(child_result.has_value());
    const auto grandchild_result = child_result.value()->subview(2, 2);
    assert(grandchild_result.has_value());
    const auto* grandchild = grandchild_result.value();
    assert(grandchild != nullptr);
    assert(grandchild->captured().data() == kBytes.data() + 6);
    assert(grandchild->absolute_offset() == 6);
    assert(value(grandchild->read_be16(0)) == 0xCDEFU);
}

void uncaptured_but_logical_subview_reports_truncation_on_read() {
    const auto root = PacketView::from_capture(std::span(kBytes).first(4), 16);
    const auto child_result = root.subview(8, 4);
    assert(child_result.has_value());
    const auto* child = child_result.value();
    assert(child != nullptr);
    assert(child->captured().empty());
    assert(child->absolute_offset() == 8);
    assert(error(child->read_u8(0)).code == PacketReadErrorCode::CaptureTruncated);
}

void invalid_ranges_report_their_exact_boundary() {
    const auto view = PacketView::from_capture(std::span(kBytes).first(8), 8);
    assert(error(view.read_bytes(std::numeric_limits<std::size_t>::max(), 2)).code ==
           PacketReadErrorCode::OffsetOverflow);

    const auto child_result = view.subview(7, 2);
    assert(!child_result.has_value());
    assert(child_result.error() != nullptr);
    assert(child_result.error()->code == PacketReadErrorCode::PastReportedLength);
}

} // namespace

int main() {
    root_view_preserves_lengths_and_source();
    endian_reads_are_correct();
    capture_truncation_is_distinct();
    reported_length_is_enforced_before_capture_length();
    child_view_preserves_parent_boundary();
    child_capture_is_capped_by_its_reported_length();
    subviews_are_zero_copy_and_accumulate_offsets();
    uncaptured_but_logical_subview_reports_truncation_on_read();
    invalid_ranges_report_their_exact_boundary();
    return 0;
}

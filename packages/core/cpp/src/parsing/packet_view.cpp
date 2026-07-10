#include "pruftnet/parsing/packet_view.hpp"

#include <algorithm>
#include <limits>

namespace pruftnet::parsing {

namespace {

template <typename Integer>
PacketReadResult<Integer> read_big_endian(const PacketView& view, std::size_t offset) noexcept {
    const auto result = view.read_bytes(offset, sizeof(Integer));
    if (const auto* error = std::get_if<PacketReadError>(&result)) {
        return *error;
    }

    Integer value = 0;
    for (const auto byte : std::get<std::span<const std::byte>>(result)) {
        value = static_cast<Integer>((value << 8U) | std::to_integer<std::uint8_t>(byte));
    }
    return value;
}

template <typename Integer>
PacketReadResult<Integer> read_little_endian(const PacketView& view, std::size_t offset) noexcept {
    const auto result = view.read_bytes(offset, sizeof(Integer));
    if (const auto* error = std::get_if<PacketReadError>(&result)) {
        return *error;
    }

    Integer value = 0;
    std::size_t shift = 0;
    for (const auto byte : std::get<std::span<const std::byte>>(result)) {
        value |= static_cast<Integer>(std::to_integer<std::uint8_t>(byte)) << shift;
        shift += 8U;
    }
    return value;
}

} // namespace

PacketView PacketView::from_capture(std::span<const std::byte> captured, std::size_t reported_length,
                                    std::uint32_t data_source_id) noexcept {
    return PacketView(captured.first(std::min(captured.size(), reported_length)), reported_length, reported_length, 0,
                      data_source_id);
}

PacketView::PacketView(std::span<const std::byte> captured, std::size_t reported_length, std::size_t contained_length,
                       std::size_t absolute_offset, std::uint32_t data_source_id) noexcept
    : captured_(captured), reported_length_(reported_length), contained_length_(contained_length),
      absolute_offset_(absolute_offset), data_source_id_(data_source_id) {}

std::span<const std::byte> PacketView::captured() const noexcept { return captured_; }

std::size_t PacketView::captured_length() const noexcept { return captured_.size(); }

std::size_t PacketView::reported_length() const noexcept { return reported_length_; }

std::size_t PacketView::contained_length() const noexcept { return contained_length_; }

std::size_t PacketView::absolute_offset() const noexcept { return absolute_offset_; }

std::uint32_t PacketView::data_source_id() const noexcept { return data_source_id_; }

PacketSubviewResult PacketView::subview(std::size_t offset, std::size_t length) const noexcept {
    return subview(offset, length, length);
}

PacketSubviewResult PacketView::subview(std::size_t offset, std::size_t contained_length,
                                        std::size_t reported_length) const noexcept {
    const auto logical_end = checked_end(offset, contained_length, false);
    if (const auto* error = std::get_if<PacketReadError>(&logical_end)) {
        return *error;
    }
    if (offset > std::numeric_limits<std::size_t>::max() - absolute_offset_) {
        return make_error(PacketReadErrorCode::OffsetOverflow, offset, contained_length);
    }

    const auto captured_offset = std::min(offset, captured_.size());
    const auto available = captured_.size() - captured_offset;
    const auto child_captured_length = std::min({available, contained_length, reported_length});
    return PacketView(captured_.subspan(captured_offset, child_captured_length), reported_length, contained_length,
                      absolute_offset_ + offset, data_source_id_);
}

PacketReadResult<std::span<const std::byte>> PacketView::read_bytes(std::size_t offset,
                                                                    std::size_t length) const noexcept {
    const auto end = checked_end(offset, length, true);
    if (const auto* error = std::get_if<PacketReadError>(&end)) {
        return *error;
    }
    return captured_.subspan(offset, length);
}

PacketReadResult<std::uint8_t> PacketView::read_u8(std::size_t offset) const noexcept {
    const auto result = read_bytes(offset, 1);
    if (const auto* error = std::get_if<PacketReadError>(&result)) {
        return *error;
    }
    return std::to_integer<std::uint8_t>(std::get<std::span<const std::byte>>(result)[0]);
}

PacketReadResult<std::uint16_t> PacketView::read_be16(std::size_t offset) const noexcept {
    return read_big_endian<std::uint16_t>(*this, offset);
}

PacketReadResult<std::uint32_t> PacketView::read_be32(std::size_t offset) const noexcept {
    return read_big_endian<std::uint32_t>(*this, offset);
}

PacketReadResult<std::uint64_t> PacketView::read_be64(std::size_t offset) const noexcept {
    return read_big_endian<std::uint64_t>(*this, offset);
}

PacketReadResult<std::uint16_t> PacketView::read_le16(std::size_t offset) const noexcept {
    return read_little_endian<std::uint16_t>(*this, offset);
}

PacketReadResult<std::uint32_t> PacketView::read_le32(std::size_t offset) const noexcept {
    return read_little_endian<std::uint32_t>(*this, offset);
}

PacketReadResult<std::uint64_t> PacketView::read_le64(std::size_t offset) const noexcept {
    return read_little_endian<std::uint64_t>(*this, offset);
}

PacketReadError PacketView::make_error(PacketReadErrorCode code, std::size_t offset,
                                       std::size_t length) const noexcept {
    return PacketReadError{
        .code = code,
        .offset = offset,
        .length = length,
        .captured_length = captured_.size(),
        .reported_length = reported_length_,
        .contained_length = contained_length_,
    };
}

PacketReadResult<std::size_t> PacketView::checked_end(std::size_t offset, std::size_t length,
                                                      bool require_captured) const noexcept {
    if (length > std::numeric_limits<std::size_t>::max() - offset) {
        return make_error(PacketReadErrorCode::OffsetOverflow, offset, length);
    }
    const auto end = offset + length;
    if (end > reported_length_) {
        return make_error(PacketReadErrorCode::PastReportedLength, offset, length);
    }
    if (end > contained_length_) {
        return make_error(PacketReadErrorCode::PastParentBoundary, offset, length);
    }
    if (require_captured && end > captured_.size()) {
        return make_error(PacketReadErrorCode::CaptureTruncated, offset, length);
    }
    return end;
}

PacketSubviewResult::PacketSubviewResult(PacketView view) noexcept : result_(view) {}

PacketSubviewResult::PacketSubviewResult(PacketReadError error) noexcept : result_(error) {}

bool PacketSubviewResult::has_value() const noexcept { return std::holds_alternative<PacketView>(result_); }

const PacketView* PacketSubviewResult::value() const& noexcept { return std::get_if<PacketView>(&result_); }

const PacketReadError* PacketSubviewResult::error() const& noexcept { return std::get_if<PacketReadError>(&result_); }

} // namespace pruftnet::parsing

#pragma once

#include <cstddef>
#include <cstdint>
#include <span>
#include <variant>

namespace pruftnet::parsing {

enum class PacketReadErrorCode {
    CaptureTruncated,
    PastReportedLength,
    PastParentBoundary,
    OffsetOverflow,
};

struct PacketReadError {
    PacketReadErrorCode code;
    std::size_t offset = 0;
    std::size_t length = 0;
    std::size_t captured_length = 0;
    std::size_t reported_length = 0;
    std::size_t contained_length = 0;

    friend constexpr bool operator==(const PacketReadError&, const PacketReadError&) = default;
};

template <typename Value> using PacketReadResult = std::variant<Value, PacketReadError>;

class PacketSubviewResult;

class PacketView {
public:
    // PacketView and all spans returned from it borrow the input storage. The
    // storage owner must outlive the root view, every child view, and read result.
    static PacketView from_capture(std::span<const std::byte> captured, std::size_t reported_length,
                                   std::uint32_t data_source_id = 0) noexcept;

    [[nodiscard]] std::span<const std::byte> captured() const noexcept;
    [[nodiscard]] std::size_t captured_length() const noexcept;
    [[nodiscard]] std::size_t reported_length() const noexcept;
    [[nodiscard]] std::size_t contained_length() const noexcept;
    [[nodiscard]] std::size_t absolute_offset() const noexcept;
    [[nodiscard]] std::uint32_t data_source_id() const noexcept;

    [[nodiscard]] PacketSubviewResult subview(std::size_t offset, std::size_t length) const noexcept;
    [[nodiscard]] PacketSubviewResult subview(std::size_t offset, std::size_t contained_length,
                                              std::size_t reported_length) const noexcept;

    [[nodiscard]] PacketReadResult<std::span<const std::byte>> read_bytes(std::size_t offset,
                                                                          std::size_t length) const noexcept;
    [[nodiscard]] PacketReadResult<std::uint8_t> read_u8(std::size_t offset) const noexcept;
    [[nodiscard]] PacketReadResult<std::uint16_t> read_be16(std::size_t offset) const noexcept;
    [[nodiscard]] PacketReadResult<std::uint32_t> read_be32(std::size_t offset) const noexcept;
    [[nodiscard]] PacketReadResult<std::uint64_t> read_be64(std::size_t offset) const noexcept;
    [[nodiscard]] PacketReadResult<std::uint16_t> read_le16(std::size_t offset) const noexcept;
    [[nodiscard]] PacketReadResult<std::uint32_t> read_le32(std::size_t offset) const noexcept;
    [[nodiscard]] PacketReadResult<std::uint64_t> read_le64(std::size_t offset) const noexcept;

private:
    PacketView(std::span<const std::byte> captured, std::size_t reported_length, std::size_t contained_length,
               std::size_t absolute_offset, std::uint32_t data_source_id) noexcept;

    [[nodiscard]] PacketReadError make_error(PacketReadErrorCode code, std::size_t offset,
                                             std::size_t length) const noexcept;
    [[nodiscard]] PacketReadResult<std::size_t> checked_end(std::size_t offset, std::size_t length,
                                                            bool require_captured) const noexcept;

    std::span<const std::byte> captured_;
    std::size_t reported_length_ = 0;
    std::size_t contained_length_ = 0;
    std::size_t absolute_offset_ = 0;
    std::uint32_t data_source_id_ = 0;
};

class PacketSubviewResult {
public:
    PacketSubviewResult(PacketView view) noexcept;
    PacketSubviewResult(PacketReadError error) noexcept;

    [[nodiscard]] bool has_value() const noexcept;
    [[nodiscard]] const PacketView* value() const& noexcept;
    [[nodiscard]] const PacketView* value() const&& = delete;
    [[nodiscard]] const PacketReadError* error() const& noexcept;
    [[nodiscard]] const PacketReadError* error() const&& = delete;

private:
    std::variant<PacketView, PacketReadError> result_;
};

} // namespace pruftnet::parsing

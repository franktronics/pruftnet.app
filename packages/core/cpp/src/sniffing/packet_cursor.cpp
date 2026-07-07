#include "sniffing/packet_cursor.hpp"

namespace pruftnet::sniffing::internal {

PacketCursor::PacketCursor(std::span<const std::byte> bytes) noexcept : bytes_(bytes) {}

std::size_t PacketCursor::size() const noexcept { return bytes_.size(); }

bool PacketCursor::can_read(std::size_t offset, std::size_t length) const noexcept {
    return offset <= bytes_.size() && length <= bytes_.size() - offset;
}

std::size_t PacketCursor::available_from(std::size_t offset) const noexcept {
    if (offset >= bytes_.size()) {
        return 0;
    }
    return bytes_.size() - offset;
}

std::optional<std::uint8_t> PacketCursor::read_u8(std::size_t offset) const noexcept {
    if (!can_read(offset, 1)) {
        return std::nullopt;
    }

    return static_cast<std::uint8_t>(bytes_[offset]);
}

std::optional<std::uint16_t> PacketCursor::read_be16(std::size_t offset) const noexcept {
    if (!can_read(offset, 2)) {
        return std::nullopt;
    }

    const auto high = static_cast<std::uint16_t>(bytes_[offset]);
    const auto low = static_cast<std::uint16_t>(bytes_[offset + 1]);
    return static_cast<std::uint16_t>((high << 8U) | low);
}

std::optional<std::uint32_t> PacketCursor::read_be32(std::size_t offset) const noexcept {
    if (!can_read(offset, 4)) {
        return std::nullopt;
    }

    const auto b0 = static_cast<std::uint32_t>(bytes_[offset]);
    const auto b1 = static_cast<std::uint32_t>(bytes_[offset + 1]);
    const auto b2 = static_cast<std::uint32_t>(bytes_[offset + 2]);
    const auto b3 = static_cast<std::uint32_t>(bytes_[offset + 3]);
    return (b0 << 24U) | (b1 << 16U) | (b2 << 8U) | b3;
}

} // namespace pruftnet::sniffing::internal

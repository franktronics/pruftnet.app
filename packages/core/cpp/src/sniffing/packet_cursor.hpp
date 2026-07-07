#pragma once

#include <cstddef>
#include <cstdint>
#include <optional>
#include <span>

namespace pruftnet::sniffing::internal {

class PacketCursor {
public:
    explicit PacketCursor(std::span<const std::byte> bytes) noexcept;

    [[nodiscard]] std::size_t size() const noexcept;
    [[nodiscard]] bool can_read(std::size_t offset, std::size_t length) const noexcept;
    [[nodiscard]] std::size_t available_from(std::size_t offset) const noexcept;
    [[nodiscard]] std::optional<std::uint8_t> read_u8(std::size_t offset) const noexcept;
    [[nodiscard]] std::optional<std::uint16_t> read_be16(std::size_t offset) const noexcept;
    [[nodiscard]] std::optional<std::uint32_t> read_be32(std::size_t offset) const noexcept;

private:
    std::span<const std::byte> bytes_;
};

} // namespace pruftnet::sniffing::internal

#pragma once

#include <cstddef>
#include <cstdint>
#include <span>
#include <string_view>

namespace pruftnet::parsing::internal {

inline bool is_valid_utf8(std::span<const std::byte> bytes) noexcept {
    std::size_t index = 0;
    while (index < bytes.size()) {
        const auto first = std::to_integer<std::uint8_t>(bytes[index]);
        if (first <= 0x7FU) {
            ++index;
            continue;
        }

        std::size_t length = 0;
        std::uint32_t code_point = 0;
        std::uint32_t minimum = 0;
        if ((first & 0xE0U) == 0xC0U) {
            length = 2;
            code_point = first & 0x1FU;
            minimum = 0x80U;
        } else if ((first & 0xF0U) == 0xE0U) {
            length = 3;
            code_point = first & 0x0FU;
            minimum = 0x800U;
        } else if ((first & 0xF8U) == 0xF0U) {
            length = 4;
            code_point = first & 0x07U;
            minimum = 0x10000U;
        } else {
            return false;
        }
        if (length > bytes.size() - index) {
            return false;
        }
        for (std::size_t offset = 1; offset < length; ++offset) {
            const auto continuation = std::to_integer<std::uint8_t>(bytes[index + offset]);
            if ((continuation & 0xC0U) != 0x80U) {
                return false;
            }
            code_point = (code_point << 6U) | (continuation & 0x3FU);
        }
        if (code_point < minimum || code_point > 0x10FFFFU || (code_point >= 0xD800U && code_point <= 0xDFFFU)) {
            return false;
        }
        index += length;
    }
    return true;
}

inline bool is_valid_utf8(std::string_view text) noexcept {
    return is_valid_utf8(std::span<const std::byte>(reinterpret_cast<const std::byte*>(text.data()), text.size()));
}

} // namespace pruftnet::parsing::internal

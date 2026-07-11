#include <array>
#include <cassert>
#include <cstddef>
#include <span>

#include "parsing/utf8.hpp"

namespace {

template <std::size_t Size> bool valid(const std::array<unsigned char, Size>& input) {
    return pruftnet::parsing::internal::is_valid_utf8(
        std::span<const std::byte>(reinterpret_cast<const std::byte*>(input.data()), input.size()));
}

} // namespace

int main() {
    assert(valid(std::array<unsigned char, 3>{'a', 0, 'z'}));
    assert(valid(std::array<unsigned char, 2>{0xC2, 0xA2}));
    assert(valid(std::array<unsigned char, 3>{0xE2, 0x82, 0xAC}));
    assert(valid(std::array<unsigned char, 4>{0xF4, 0x8F, 0xBF, 0xBF}));
    assert(!valid(std::array<unsigned char, 2>{0xC0, 0xAF}));
    assert(!valid(std::array<unsigned char, 3>{0xED, 0xA0, 0x80}));
    assert(!valid(std::array<unsigned char, 4>{0xF4, 0x90, 0x80, 0x80}));
    assert(!valid(std::array<unsigned char, 2>{0xE2, 0x82}));
    assert(!valid(std::array<unsigned char, 1>{0x80}));
    return 0;
}

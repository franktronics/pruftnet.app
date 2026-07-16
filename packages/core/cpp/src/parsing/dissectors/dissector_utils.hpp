#pragma once

#include <cstddef>
#include <span>
#include <string>

namespace pruftnet::parsing::internal {

[[nodiscard]] std::string escaped_ascii(std::span<const std::byte> bytes);
[[nodiscard]] bool
internet_checksum_valid(std::span<const std::byte> bytes) noexcept;

} // namespace pruftnet::parsing::internal

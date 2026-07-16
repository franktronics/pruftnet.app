#pragma once

#include <array>
#include <cstddef>
#include <cstdint>
#include <span>

namespace pruftnet::parsing::internal {

enum class IpFamily : std::uint8_t { V4, V6 };

struct NetworkLayerContext {
  IpFamily family = IpFamily::V4;
  std::array<std::byte, 16> source{};
  std::array<std::byte, 16> destination{};
  std::uint8_t address_length = 0;

  [[nodiscard]] std::span<const std::byte> source_address() const noexcept {
    return std::span(source).first(address_length);
  }

  [[nodiscard]] std::span<const std::byte>
  destination_address() const noexcept {
    return std::span(destination).first(address_length);
  }
};

} // namespace pruftnet::parsing::internal

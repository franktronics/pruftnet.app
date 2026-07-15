#pragma once

#include <cstdint>
#include <iosfwd>
#include <optional>
#include <string>
#include <string_view>

namespace pruftnet::capture_worker::protocol {

inline constexpr std::uint32_t kMaxRequestBytes = 64 * 1024;

enum class FrameRead { Ok, TooLarge, End, Truncated };

[[nodiscard]] std::string json_string(std::string_view value);
[[nodiscard]] std::optional<std::string> field(std::string_view json,
                                               std::string_view key);
[[nodiscard]] std::optional<std::uint64_t> number(std::string_view json,
                                                  std::string_view key);
[[nodiscard]] std::optional<bool> boolean_field(std::string_view json,
                                                std::string_view key);

[[nodiscard]] FrameRead read_frame(std::istream &input, std::string &payload);
void write_frame(std::ostream &output, std::string_view payload);

} // namespace pruftnet::capture_worker::protocol

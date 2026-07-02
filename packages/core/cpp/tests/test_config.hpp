#pragma once

#include <chrono>
#include <cstdint>
#include <cstdlib>
#include <filesystem>
#include <optional>
#include <string>
#include <string_view>

namespace pruftnet::tests {

inline constexpr int kSkipExitCode = 77;
inline constexpr std::uint64_t kLivePacketsToCapture = 5;
inline constexpr std::uint64_t kOfflineExpectedPacketCount = 10;
inline constexpr auto kLiveSniffingTimeout = std::chrono::seconds(5);
inline constexpr auto kOfflineSniffingTimeout = std::chrono::seconds(2);

inline std::optional<std::string> live_interface_name() {
    const auto* value = std::getenv("PRUFTNET_TEST_INTERFACE");
    if (value == nullptr || value[0] == '\0') {
        return std::nullopt;
    }

    return std::string(value);
}

inline std::filesystem::path fixture_path(std::string_view filename) {
#if defined(PRUFTNET_TEST_FIXTURES_DIR)
    return std::filesystem::path(PRUFTNET_TEST_FIXTURES_DIR) / std::string(filename);
#else
    return std::filesystem::path("tests") / "fixtures" / std::string(filename);
#endif
}

} // namespace pruftnet::tests

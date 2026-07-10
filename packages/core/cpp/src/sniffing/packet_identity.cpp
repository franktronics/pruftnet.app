#include "sniffing/packet_identity.hpp"

#include <array>
#include <cstdint>
#include <cstring>

#if defined(_WIN32)
#include <bcrypt.h>
#elif defined(__APPLE__)
#include <stdlib.h>
#elif defined(__linux__)
#include <cerrno>
#include <sys/random.h>
#endif

namespace pruftnet::sniffing::internal {

namespace {

bool fill_random(std::span<std::byte> output) noexcept {
#if defined(_WIN32)
    return BCryptGenRandom(nullptr, reinterpret_cast<PUCHAR>(output.data()), static_cast<ULONG>(output.size()),
                           BCRYPT_USE_SYSTEM_PREFERRED_RNG) == 0;
#elif defined(__APPLE__)
    arc4random_buf(output.data(), output.size());
    return true;
#elif defined(__linux__)
    std::size_t written = 0;
    while (written < output.size()) {
        const auto result = getrandom(output.data() + written, output.size() - written, 0);
        if (result > 0) {
            written += static_cast<std::size_t>(result);
            continue;
        }
        if (result < 0 && errno == EINTR) {
            continue;
        }
        return false;
    }
    return true;
#else
    (void)output;
    return false;
#endif
}

} // namespace

std::optional<CaptureId> make_capture_id() noexcept {
    for (int attempt = 0; attempt < 2; ++attempt) {
        std::array<std::byte, sizeof(CaptureId)> random_bytes{};
        if (!fill_random(random_bytes)) {
            return std::nullopt;
        }

        CaptureId id;
        std::memcpy(&id, random_bytes.data(), sizeof(id));
        if (!id.is_nil()) {
            return id;
        }
    }
    return std::nullopt;
}

} // namespace pruftnet::sniffing::internal

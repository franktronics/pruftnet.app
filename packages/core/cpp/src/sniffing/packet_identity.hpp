#pragma once

#include <optional>

#include "pruftnet/sniffing/packet.hpp"

namespace pruftnet::sniffing::internal {

[[nodiscard]] std::optional<CaptureId> make_capture_id() noexcept;

} // namespace pruftnet::sniffing::internal

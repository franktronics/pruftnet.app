#pragma once

#include <cstddef>
#include <cstdint>

namespace pruftnet::parsing {
class PacketView;
}

namespace pruftnet::parsing::internal {

class DissectorContext;

struct DissectionResult {
    std::size_t consumed_length = 0;
};

using DissectorFunction = DissectionResult (*)(DissectorContext&, const void*, const PacketView&, std::uint32_t);

struct DissectorHandle {
    DissectorFunction function = nullptr;
    const void* state = nullptr;

    [[nodiscard]] explicit operator bool() const noexcept { return function != nullptr && state != nullptr; }
};

} // namespace pruftnet::parsing::internal

#include <algorithm>
#include <cstddef>
#include <cstdint>
#include <cstdlib>
#include <fstream>
#include <iterator>
#include <limits>
#include <span>
#include <vector>

#include "pruftnet/parsing/packet_view.hpp"

namespace {

std::size_t input_value(const std::uint8_t* data, std::size_t size, std::size_t offset) noexcept {
    std::size_t value = 0;
    const auto count = std::min(sizeof(value), size > offset ? size - offset : 0);
    for (std::size_t index = 0; index < count; ++index) {
        value |= static_cast<std::size_t>(data[offset + index]) << (index * 8U);
    }
    return value;
}

void verify_view(const pruftnet::parsing::PacketView& view) {
    if (view.captured_length() > view.reported_length() || view.captured_length() > view.contained_length()) {
        std::abort();
    }
}

} // namespace

extern "C" int LLVMFuzzerTestOneInput(const std::uint8_t* data, std::size_t size) {
    const auto bytes = std::span<const std::byte>(reinterpret_cast<const std::byte*>(data), size);
    const auto reported_length = input_value(data, size, 0);
    const auto view = pruftnet::parsing::PacketView::from_capture(bytes, reported_length, 3);
    verify_view(view);
    const auto offset = input_value(data, size, sizeof(std::size_t));

    (void)view.read_u8(offset);
    (void)view.read_be16(offset);
    (void)view.read_be32(offset);
    (void)view.read_be64(offset);
    (void)view.read_le16(offset);
    (void)view.read_le32(offset);
    (void)view.read_le64(offset);
    (void)view.read_bytes(offset, input_value(data, size, sizeof(std::size_t) * 2U));
    (void)view.read_bytes(std::numeric_limits<std::size_t>::max(), input_value(data, size, sizeof(std::size_t) * 3U));

    const auto contained_length = input_value(data, size, sizeof(std::size_t) * 4U);
    const auto child_reported_length = input_value(data, size, sizeof(std::size_t) * 5U);
    const auto child_result = view.subview(offset, contained_length, child_reported_length);
    if (const auto* child = child_result.value()) {
        verify_view(*child);
        const auto nested_offset = input_value(data, size, sizeof(std::size_t) * 6U);
        const auto nested_length = input_value(data, size, sizeof(std::size_t) * 7U);
        (void)child->read_bytes(nested_offset, nested_length);
        const auto nested_result = child->subview(nested_offset, nested_length, reported_length);
        if (const auto* nested = nested_result.value()) {
            verify_view(*nested);
            (void)nested->subview(offset, contained_length, child_reported_length);
        }
    }
    return 0;
}

#if defined(PRUFTNET_STANDALONE_FUZZER)
int main(int argc, char** argv) {
    if (argc <= 1) {
        const std::uint8_t seed[] = {
            64, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 8, 0, 0, 0, 0, 0, 0, 0,
        };
        return LLVMFuzzerTestOneInput(seed, sizeof(seed));
    }

    for (int index = 1; index < argc; ++index) {
        std::ifstream input(argv[index], std::ios::binary);
        std::vector<std::uint8_t> bytes{std::istreambuf_iterator<char>(input), std::istreambuf_iterator<char>()};
        (void)LLVMFuzzerTestOneInput(bytes.data(), bytes.size());
    }
    return 0;
}
#endif

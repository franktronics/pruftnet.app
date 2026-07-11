#include <array>
#include <atomic>
#include <cassert>
#include <cstdlib>
#include <iostream>
#include <memory>
#include <new>
#include <variant>
#include <vector>

#include "parsing/packet_parser.hpp"
#include "tests/support/ethernet_ipv4_udp_fixture.hpp"

namespace {

std::atomic<bool> count_allocations{false};
std::atomic<std::size_t> allocation_count{0};
std::atomic<std::size_t> allocated_bytes{0};

} // namespace

void* operator new(std::size_t size) {
    if (count_allocations.load(std::memory_order_relaxed)) {
        allocation_count.fetch_add(1, std::memory_order_relaxed);
        allocated_bytes.fetch_add(size, std::memory_order_relaxed);
    }
    if (auto* memory = std::malloc(size)) {
        return memory;
    }
    throw std::bad_alloc();
}

void operator delete(void* memory) noexcept { std::free(memory); }

void operator delete(void* memory, std::size_t) noexcept { std::free(memory); }

int main() {
    auto registry_result = pruftnet::parsing::make_core_registry();
    assert(std::holds_alternative<pruftnet::parsing::RegistrySnapshot>(registry_result));
    const auto registry = std::make_shared<const pruftnet::parsing::RegistrySnapshot>(
        std::move(std::get<pruftnet::parsing::RegistrySnapshot>(registry_result)));
    constexpr std::array payload{std::byte{'h'}, std::byte{'e'}, std::byte{'l'}, std::byte{'l'}, std::byte{'o'}};
    const auto bytes = pruftnet::tests::ethernet_ipv4_udp_packet(payload);
    const auto raw = pruftnet::tests::raw_packet_view(bytes, bytes.size());
    pruftnet::parsing::internal::PacketParser parser(registry);
    auto warm_tree = parser.parse(raw);
    parser.recycle(std::move(warm_tree));

    allocation_count.store(0, std::memory_order_relaxed);
    allocated_bytes.store(0, std::memory_order_relaxed);
    count_allocations.store(true, std::memory_order_release);
    const auto tree = parser.parse(raw);
    count_allocations.store(false, std::memory_order_release);

    assert(tree.condition() == pruftnet::parsing::ParseCondition::Complete);
    assert(tree.value_arena().empty());
    std::cout << "packet_parser.allocations_per_packet=" << allocation_count.load(std::memory_order_relaxed) << '\n';
    std::cout << "packet_parser.allocated_bytes_per_packet=" << allocated_bytes.load(std::memory_order_relaxed) << '\n';
    assert(allocation_count.load(std::memory_order_relaxed) == 0);
    assert(allocated_bytes.load(std::memory_order_relaxed) == 0);

    std::vector<std::byte> phase5_bytes(14 + 40 + 24, std::byte{0});
    phase5_bytes[12] = std::byte{0x86};
    phase5_bytes[13] = std::byte{0xdd};
    phase5_bytes[14] = std::byte{0x60};
    phase5_bytes[18] = std::byte{0};
    phase5_bytes[19] = std::byte{24};
    phase5_bytes[20] = std::byte{58};
    phase5_bytes[21] = std::byte{64};
    phase5_bytes[54] = std::byte{134};
    phase5_bytes[70] = std::byte{5};
    phase5_bytes[71] = std::byte{1};
    const auto phase5_raw = pruftnet::tests::raw_packet_view(phase5_bytes, phase5_bytes.size());
    auto phase5_warm = parser.parse(phase5_raw);
    parser.recycle(std::move(phase5_warm));
    allocation_count.store(0, std::memory_order_relaxed);
    allocated_bytes.store(0, std::memory_order_relaxed);
    count_allocations.store(true, std::memory_order_release);
    const auto phase5_tree = parser.parse(phase5_raw);
    count_allocations.store(false, std::memory_order_release);
    assert(phase5_tree.condition() == pruftnet::parsing::ParseCondition::Complete);
    assert(allocation_count.load(std::memory_order_relaxed) == 0);
    assert(allocated_bytes.load(std::memory_order_relaxed) == 0);
}

#include <atomic>
#include <cassert>
#include <cstdlib>
#include <memory>
#include <new>
#include <variant>

#include "pruftnet/parsing/packet_tree_codec.hpp"
#include "pruftnet/parsing/parsed_tree.hpp"
#include "tests/support/packet_tree_fixture.hpp"

namespace {

std::atomic<bool> count_allocations{false};
std::atomic<std::size_t> allocation_count{0};

} // namespace

void* operator new(std::size_t size) {
    if (count_allocations.load(std::memory_order_relaxed)) {
        allocation_count.fetch_add(1, std::memory_order_relaxed);
    }
    if (auto* memory = std::malloc(size)) {
        return memory;
    }
    throw std::bad_alloc();
}

void operator delete(void* memory) noexcept { std::free(memory); }

void operator delete(void* memory, std::size_t) noexcept { std::free(memory); }

int main() {
    using namespace pruftnet::parsing;

    RegistryBuilder registry_builder;
    const auto protocol = std::get<ProtocolId>(registry_builder.register_protocol("allocation", "Allocation"));
    const auto root = std::get<FieldId>(
        registry_builder.register_field(protocol, "allocation.root", "Root", FieldValueType::Protocol));
    const auto number = std::get<FieldId>(
        registry_builder.register_field(protocol, "allocation.number", "Number", FieldValueType::Unsigned));
    const auto registry =
        std::make_shared<const RegistrySnapshot>(std::get<RegistrySnapshot>(registry_builder.freeze()));

    ParseBudget budget;
    budget.max_nodes = 4'097;
    budget.max_encoded_bytes = 512 + 4'097 * sizeof(ParsedFieldNode) + sizeof(ParsedDataSource) + 8;
    ParsedPacketTreeBuilder builder(registry, {.capture_id = {.high = 1, .low = 2}, .packet_id = 1}, budget);
    const std::byte captured{0};
    const auto source = builder.add_data_source("wire", std::span(&captured, 1), DataSourceKind::Captured);
    assert(std::holds_alternative<DataSourceId>(source));
    const auto root_node = builder.add_none(root, kNoParentIndex, 0, 0, 1);
    assert(std::holds_alternative<std::uint32_t>(root_node));

    allocation_count.store(0, std::memory_order_relaxed);
    count_allocations.store(true, std::memory_order_relaxed);
    for (std::uint32_t index = 0; index < 4'096; ++index) {
        const auto node = builder.add_unsigned(number, 0, 0, 0, 1, index);
        if (!std::holds_alternative<std::uint32_t>(node)) {
            std::abort();
        }
    }
    count_allocations.store(false, std::memory_order_relaxed);

    // A vector grows geometrically; one allocation per occurrence would exceed 4,000.
    assert(allocation_count.load(std::memory_order_relaxed) <= 20);
    const auto tree = builder.finalize();
    assert(std::get<ParsedPacketTree>(tree).nodes().size() == 4'097);

    const auto fixture = pruftnet::tests::make_packet_tree_fixture();
    PacketTreeEncoder encoder;
    const auto warm = encoder.encode(fixture.tree);
    assert(std::holds_alternative<std::span<const std::byte>>(warm));
    allocation_count.store(0, std::memory_order_relaxed);
    count_allocations.store(true, std::memory_order_relaxed);
    for (int iteration = 0; iteration < 100; ++iteration) {
        const auto encoded = encoder.encode(fixture.tree);
        if (!std::holds_alternative<std::span<const std::byte>>(encoded)) {
            std::abort();
        }
    }
    count_allocations.store(false, std::memory_order_relaxed);
    assert(allocation_count.load(std::memory_order_relaxed) == 0);
    return 0;
}

#include <array>
#include <cassert>
#include <cstddef>
#include <cstdint>

#include "pruftnet/capture/packet_ring.hpp"

using pruftnet::capture::PacketRecord;
using pruftnet::capture::PacketRing;

namespace {

std::array<std::byte, 4> bytes(std::uint8_t first) {
    return {
        std::byte(first),
        std::byte(first + 1),
        std::byte(first + 2),
        std::byte(first + 3),
    };
}

void push_pop_preserves_order_and_bytes() {
    PacketRing ring(2, 8);

    PacketRecord first;
    first.sequence = 1;
    first.captured_len = 4;
    auto first_bytes = bytes(1);

    PacketRecord second;
    second.sequence = 2;
    second.captured_len = 4;
    auto second_bytes = bytes(9);

    assert(ring.try_push(first, first_bytes));
    assert(ring.try_push(second, second_bytes));
    assert(ring.full());
    assert(ring.depth() == 2);

    auto first_view = ring.peek();
    assert(first_view.has_value());
    assert(first_view->record.sequence == 1);
    assert(first_view->bytes.size() == 4);
    assert(first_view->bytes[0] == std::byte(1));
    ring.pop();

    auto second_view = ring.peek();
    assert(second_view.has_value());
    assert(second_view->record.sequence == 2);
    assert(second_view->bytes[0] == std::byte(9));
    ring.pop();

    assert(ring.empty());
}

void full_ring_rejects_newest() {
    PacketRing ring(1, 8);
    PacketRecord record;
    record.sequence = 1;
    auto payload = bytes(1);

    assert(ring.try_push(record, payload));
    assert(!ring.try_push(record, payload));
    assert(ring.depth() == 1);
}

void packet_larger_than_slot_is_rejected() {
    PacketRing ring(1, 2);
    PacketRecord record;
    auto payload = bytes(1);

    assert(!ring.try_push(record, payload));
    assert(ring.empty());
}

} // namespace

int main() {
    push_pop_preserves_order_and_bytes();
    full_ring_rejects_newest();
    packet_larger_than_slot_is_rejected();
    return 0;
}

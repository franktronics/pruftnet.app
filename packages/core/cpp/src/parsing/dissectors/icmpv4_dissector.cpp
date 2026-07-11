#include "parsing/dissectors/icmpv4_dissector.hpp"

#include <algorithm>

#include "parsing/dissector_context.hpp"
#include "parsing/dissectors/dissector_states.hpp"

namespace pruftnet::parsing::internal {
namespace {

bool add_available(DissectorContext& context, FieldId field, std::uint32_t parent, const PacketView& view,
                   std::size_t offset) {
    const auto logical = view.reported_length() > offset ? view.reported_length() - offset : 0;
    const auto available = view.captured_length() > offset ? view.captured_length() - offset : 0;
    if (available < logical) {
        context.mark_partial();
    }
    if (offset > view.captured_length()) {
        return true;
    }
    return context.add_bytes(field, parent, view, offset,
                             view.captured().subspan(offset, available));
}

bool add_fixed_prefix(DissectorContext& context, FieldId field, std::uint32_t parent, const PacketView& view,
                      std::size_t offset, std::size_t logical) {
    const auto available = view.captured_length() > offset
                               ? std::min(logical, view.captured_length() - offset)
                               : std::size_t{0};
    if (available < logical) {
        context.mark_partial();
    }
    if (offset > view.captured_length()) {
        return true;
    }
    return context.add_bytes(field, parent, view, offset, view.captured().subspan(offset, available));
}

bool supported_error_code(std::uint8_t type, std::uint8_t code) noexcept {
    return (type == 3 && code <= 15) || (type == 5 && code <= 3) || (type == 11 && code <= 1) ||
           (type == 12 && code <= 2);
}

} // namespace

DissectionResult dissect_icmpv4(DissectorContext& context, const void* opaque, const PacketView& view,
                                 std::uint32_t parent) {
    const auto& state = *static_cast<const Icmpv4DissectorState*>(opaque);
    const auto message = context.add_protocol(state.message, parent, view, view.captured_length());
    if (!message || context.stopped()) {
        return {};
    }
    const auto type = context.read(view.read_u8(0));
    const auto code = context.read(view.read_u8(1));
    const auto checksum = context.read(view.read_be16(2));
    if (!type || !code || !checksum) {
        return {};
    }
    if (!context.add_unsigned(state.type, *message, view, 0, 1, *type) ||
        !context.add_unsigned(state.code, *message, view, 1, 1, *code) ||
        !context.add_unsigned(state.checksum, *message, view, 2, 2, *checksum)) {
        return {};
    }
    const bool echo = (*type == 0 || *type == 8) && *code == 0;
    const bool error = supported_error_code(*type, *code);
    if (!echo && !error) {
        (void)add_available(context, state.body, *message, view, 4);
        return {view.reported_length()};
    }
    if (view.reported_length() < 8) {
        context.mark_malformed();
        return {};
    }
    if (!add_fixed_prefix(context, state.body, *message, view, 4, 4)) {
        return {};
    }
    const auto fixed = context.read(view.read_bytes(4, 4));
    if (!fixed) {
        return {};
    }
    if (echo) {
        const auto identifier = context.read(view.read_be16(4));
        const auto sequence = context.read(view.read_be16(6));
        if (!identifier || !sequence ||
            !context.add_unsigned(state.identifier, *message, view, 4, 2, *identifier) ||
            !context.add_unsigned(state.sequence, *message, view, 6, 2, *sequence)) {
            return {};
        }
        (void)add_available(context, state.body, *message, view, 8);
        return {view.reported_length()};
    }
    if (*type == 5) {
        (void)context.add_bytes(state.gateway, *message, view, 4, *fixed);
    } else if (*type == 12) {
        const auto pointer = context.read(view.read_u8(4));
        if (pointer) {
            (void)context.add_unsigned(state.pointer, *message, view, 4, 1, *pointer);
        }
    } else if (*type == 3 && *code == 4) {
        const auto mtu = context.read(view.read_be16(6));
        if (mtu) {
            (void)context.add_unsigned(state.mtu, *message, view, 6, 2, *mtu);
        }
    }
    (void)add_available(context, state.quoted, *message, view, 8);
    return {view.reported_length()};
}

} // namespace pruftnet::parsing::internal

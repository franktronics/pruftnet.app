#include "parsing/dissectors/icmpv6_dissector.hpp"

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

bool parse_options(DissectorContext& context, const Icmpv6DissectorState& state, const PacketView& view,
                   std::uint32_t parent, std::size_t start) {
    std::size_t offset = start;
    while (offset < view.reported_length()) {
        if (!context.consume_dissector_call()) {
            return false;
        }
        if (view.reported_length() - offset < 2) {
            context.mark_malformed();
            return false;
        }
        const auto type = context.read(view.read_u8(offset));
        const auto units = context.read(view.read_u8(offset + 1));
        if (!type || !units) {
            return false;
        }
        if (*units == 0) {
            context.mark_malformed();
            return false;
        }
        const auto length = static_cast<std::size_t>(*units) * 8U;
        if (length > view.reported_length() - offset) {
            context.mark_malformed();
            return false;
        }
        const auto option_view_result = view.subview(offset, length, length);
        if (!option_view_result.has_value()) {
            context.mark_malformed();
            return false;
        }
        const auto& option_view = *option_view_result.value();
        const auto option = context.add_protocol(state.option, parent, option_view, option_view.captured_length());
        if (!option ||
            !context.add_unsigned(state.option_type, *option, option_view, 0, 1, *type) ||
            !context.add_unsigned(state.option_length, *option, option_view, 1, 1, length)) {
            return false;
        }
        if (option_view.captured_length() < length) {
            context.mark_partial();
            if (option_view.captured_length() > 2) {
                (void)context.add_bytes(state.option_body, *option, option_view, 2,
                                        option_view.captured().subspan(2));
            }
            return false;
        }
        const auto complete = option_view.captured();
        if ((*type == 3 && length != 32) || (*type == 5 && length != 8) || (*type == 4 && length < 8)) {
            context.mark_malformed();
            return false;
        }
        if ((*type == 1 || *type == 2) && length > 2) {
            if (!context.add_bytes(state.link_layer_address, *option, option_view, 2, complete.subspan(2))) {
                return false;
            }
        } else if (*type == 3 && length == 32) {
            const auto prefix_length = context.read(option_view.read_u8(2));
            const auto flags = context.read(option_view.read_u8(3));
            const auto valid = context.read(option_view.read_be32(4));
            const auto preferred = context.read(option_view.read_be32(8));
            const auto prefix = context.read(option_view.read_bytes(16, 16));
            if (!prefix_length || !flags || !valid || !preferred || !prefix ||
                !context.add_unsigned(state.prefix_length, *option, option_view, 2, 1, *prefix_length) ||
                !context.add_unsigned(state.prefix_flags, *option, option_view, 3, 1, *flags) ||
                !context.add_unsigned(state.valid_lifetime, *option, option_view, 4, 4, *valid) ||
                !context.add_unsigned(state.preferred_lifetime, *option, option_view, 8, 4, *preferred) ||
                !context.add_bytes(state.prefix, *option, option_view, 16, *prefix)) {
                return false;
            }
        } else if (*type == 4 && length >= 8) {
            if (length > 8 &&
                !context.add_bytes(state.redirected_packet, *option, option_view, 8, complete.subspan(8))) {
                return false;
            }
        } else if (*type == 5 && length == 8) {
            const auto mtu = context.read(option_view.read_be32(4));
            if (!mtu || !context.add_unsigned(state.mtu, *option, option_view, 4, 4, *mtu)) {
                return false;
            }
        } else if (length > 2 &&
                   !context.add_bytes(state.option_body, *option, option_view, 2, complete.subspan(2))) {
            return false;
        }
        offset += length;
    }
    return true;
}

} // namespace

DissectionResult dissect_icmpv6(DissectorContext& context, const void* opaque, const PacketView& view,
                                 std::uint32_t parent) {
    const auto& state = *static_cast<const Icmpv6DissectorState*>(opaque);
    const auto message = context.add_protocol(state.message, parent, view, view.captured_length());
    if (!message || context.stopped()) {
        return {};
    }
    const auto type = context.read(view.read_u8(0));
    const auto code = context.read(view.read_u8(1));
    const auto checksum = context.read(view.read_be16(2));
    if (!type || !code || !checksum ||
        !context.add_unsigned(state.type, *message, view, 0, 1, *type) ||
        !context.add_unsigned(state.code, *message, view, 1, 1, *code) ||
        !context.add_unsigned(state.checksum, *message, view, 2, 2, *checksum) ||
        !context.add_unsigned(state.informational, *message, view, 0, 0, *type >= 128,
                              ParsedNodeFlagGenerated)) {
        return {};
    }
    const bool known = (*type == 1 && *code <= 6) || (*type == 2 && *code == 0) ||
                       (*type == 3 && *code <= 1) || (*type == 4 && *code <= 2) ||
                       ((*type == 128 || *type == 129 || (*type >= 133 && *type <= 137)) && *code == 0);
    if (!known) {
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
    if (*type == 128 || *type == 129) {
        const auto identifier = context.read(view.read_be16(4));
        const auto sequence = context.read(view.read_be16(6));
        if (!identifier || !sequence ||
            !context.add_unsigned(state.identifier, *message, view, 4, 2, *identifier) ||
            !context.add_unsigned(state.sequence, *message, view, 6, 2, *sequence)) {
            return {};
        }
        (void)add_available(context, state.body, *message, view, 8);
    } else if (*type <= 4) {
        if (*type == 2) {
            const auto mtu = context.read(view.read_be32(4));
            if (mtu) {
                (void)context.add_unsigned(state.mtu, *message, view, 4, 4, *mtu);
            }
        } else if (*type == 4) {
            const auto pointer = context.read(view.read_be32(4));
            if (pointer) {
                (void)context.add_unsigned(state.pointer, *message, view, 4, 4, *pointer);
            }
        }
        (void)add_available(context, state.quoted, *message, view, 8);
    } else if (*type == 133) {
        (void)parse_options(context, state, view, *message, 8);
    } else if (*type == 134) {
        if (view.reported_length() < 16) {
            context.mark_malformed();
            return {};
        }
        if (!add_fixed_prefix(context, state.body, *message, view, 8, 8)) {
            return {};
        }
        const auto hop = context.read(view.read_u8(4));
        const auto flags = context.read(view.read_u8(5));
        const auto lifetime = context.read(view.read_be16(6));
        const auto reachable = context.read(view.read_be32(8));
        const auto retrans = context.read(view.read_be32(12));
        if (!hop || !flags || !lifetime || !reachable || !retrans ||
            !context.add_unsigned(state.current_hop_limit, *message, view, 4, 1, *hop) ||
            !context.add_unsigned(state.flags, *message, view, 5, 1, *flags) ||
            !context.add_unsigned(state.router_lifetime, *message, view, 6, 2, *lifetime) ||
            !context.add_unsigned(state.reachable_time, *message, view, 8, 4, *reachable) ||
            !context.add_unsigned(state.retrans_timer, *message, view, 12, 4, *retrans)) {
            return {};
        }
        (void)parse_options(context, state, view, *message, 16);
    } else {
        const std::size_t fixed_length = *type == 137 ? 40 : 24;
        if (view.reported_length() < fixed_length) {
            context.mark_malformed();
            return {};
        }
        if (!add_fixed_prefix(context, state.body, *message, view, 8, fixed_length - 8)) {
            return {};
        }
        if (*type == 136) {
            const auto flags = context.read(view.read_be32(4));
            if (!flags || !context.add_unsigned(state.flags, *message, view, 4, 4, *flags)) {
                return {};
            }
        }
        const auto target = context.read(view.read_bytes(8, 16));
        if (!target || !context.add_bytes(state.target, *message, view, 8, *target)) {
            return {};
        }
        if (*type == 137) {
            const auto destination = context.read(view.read_bytes(24, 16));
            if (!destination || !context.add_bytes(state.destination, *message, view, 24, *destination)) {
                return {};
            }
        }
        (void)parse_options(context, state, view, *message, fixed_length);
    }
    return {view.reported_length()};
}

} // namespace pruftnet::parsing::internal

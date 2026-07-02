#pragma once

#include <optional>

#include "pruftnet/sniffing/sniffer_error.hpp"
#include "pruftnet/sniffing/sniffer_options.hpp"

namespace pruftnet::sniffing::internal {

struct SnifferOptionsValidation {
    bool require_interface_name = true;
};

[[nodiscard]] std::optional<SnifferError> validate_sniffer_options(
    const SnifferOptions& options,
    SnifferOptionsValidation validation = {});

} // namespace pruftnet::sniffing::internal

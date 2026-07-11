#pragma once

#include <cstddef>

namespace pruftnet::parsing {

struct ParseBudget {
    std::size_t max_nodes = 65'536;
    std::size_t max_depth = 256;
    std::size_t max_dissector_calls = 1'024;
    std::size_t max_data_sources = 64;
    std::size_t max_contributors = 4'096;
    std::size_t max_string_bytes = 1U << 20U;
    std::size_t max_value_bytes = 16U << 20U;
    std::size_t max_source_bytes = 64U << 20U;
    std::size_t max_encoded_bytes = 128U << 20U;
};

} // namespace pruftnet::parsing

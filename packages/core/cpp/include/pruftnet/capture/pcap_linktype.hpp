#pragma once

#include <optional>
#include <string>
#include <string_view>
#include <vector>

namespace pruftnet::capture {

std::vector<int> default_accepted_link_types();
bool is_link_type_accepted(int link_type, const std::vector<int>& accepted_link_types);
std::string link_type_name(int link_type);
std::string link_type_description(int link_type);
std::optional<int> link_type_value_by_name(std::string_view name);
std::string format_link_type_list(const std::vector<int>& link_types);

} // namespace pruftnet::capture

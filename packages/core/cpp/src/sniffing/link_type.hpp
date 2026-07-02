#pragma once

#include <string>
#include <vector>

namespace pruftnet::sniffing::internal {

bool is_link_type_accepted(int link_type, const std::vector<int>& accepted_link_types);
std::string link_type_name(int link_type);
std::string format_link_type_list(const std::vector<int>& link_types);

} // namespace pruftnet::sniffing::internal

#pragma once

#include <string>

struct NetworkInterface {
    NetworkInterface(std::string interface_name) : name(std::move(interface_name)) {}
    std::string name;
};

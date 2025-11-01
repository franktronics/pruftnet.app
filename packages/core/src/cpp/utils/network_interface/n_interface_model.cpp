#include "n_interface_model.hpp"

NetworkInterface::NetworkInterface(std::string interface_name)
    : name_(std::move(interface_name)) {}

std::string NetworkInterface::getName() const {
    return name_;
}

void NetworkInterface::setName(const std::string& interface_name) {
    name_ = interface_name;
}
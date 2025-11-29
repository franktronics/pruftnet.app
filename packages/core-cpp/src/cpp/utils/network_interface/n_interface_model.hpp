#pragma once

#include <string>

struct NetworkInterface {
    public:
        NetworkInterface(std::string interface_name);
        std::string getName() const;
        void setName(const std::string& interface_name);
    private:
        std::string name_;
};

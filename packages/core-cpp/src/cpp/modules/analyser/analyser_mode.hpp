#pragma once
#include <string>

class Analysis {
public:
    virtual ~Analysis() = default;
    virtual bool analyze(std::string &interface_name) = 0;
};
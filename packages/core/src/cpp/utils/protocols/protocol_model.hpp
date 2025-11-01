#pragma once

#include <array>
#include <cstdint>
#include <string>
#include <vector>
#include "../common/common.hpp"

enum class ProtocolType : uint16_t {
    ETHERNET = 0x0000,
    IPV4 = 0x0800,
    IPV6 = 0x86DD,
    ARP = 0x0806,
    TCP = 0x06,
    UDP = 0x11,
    ICMP = 0x01,
    UNKNOWN = 0xFFFF
};

struct Field {
    size_t offset;           // Offset in bytes from start of packet data
    size_t size;             // Size in bytes of this field
    std::string name;
    std::string description;
    std::vector<uint8_t> value; // Extracted value from raw data
    
    // Constructor that extracts value from raw packet data
    Field(size_t offset, size_t size, const std::string& name, const std::string& description);
    
    // Default constructor
    Field();

    void calculateValue(const std::array<uint8_t, MAX_PACKET_SIZE>& raw_data);
};

struct ProtocolModel {
    virtual ~ProtocolModel() = default;
    virtual const std::vector<Field>& getFields() const = 0;
    virtual void parsePacket(const std::array<uint8_t, MAX_PACKET_SIZE>& raw_data) = 0;
    virtual ProtocolType getProtocolType() const = 0;
    virtual ProtocolType getNextProtocol() const = 0;
};
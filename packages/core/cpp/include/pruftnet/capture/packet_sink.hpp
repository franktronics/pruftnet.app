#pragma once

#include <cstddef>
#include <span>

#include "pruftnet/capture/packet_record.hpp"

namespace pruftnet::capture {

class PacketSink {
public:
    virtual ~PacketSink() = default;
    virtual void on_packet(const PacketRecord& record, std::span<const std::byte> bytes) = 0;
};

} // namespace pruftnet::capture

#pragma once

#include <chrono>
#include <cstdint>
#include <memory>
#include <thread>
#include <vector>

#include "pruftnet/sniffing/sniffer_options.hpp"
#include "sniffing/packet_source.hpp"
#include "sniffing/sniffer_runtime.hpp"

namespace pruftnet::tests {

inline pruftnet::sniffing::SnifferInterfaceOptions test_interface_options(std::uint32_t id = 0) {
    pruftnet::sniffing::SnifferInterfaceOptions interface;
    interface.id = id;
    interface.ring_slots = 16;
    interface.pcap_dispatch_batch_size = 8;
    return interface;
}

inline pruftnet::sniffing::SnifferOptions single_interface_options(std::uint32_t id = 0) {
    pruftnet::sniffing::SnifferOptions options;
    options.interfaces.push_back(test_interface_options(id));
    options.stats_poll_interval = std::chrono::milliseconds(0);
    return options;
}

inline std::vector<std::unique_ptr<pruftnet::sniffing::internal::PacketSource>> one_source(
    std::unique_ptr<pruftnet::sniffing::internal::PacketSource> source) {
    std::vector<std::unique_ptr<pruftnet::sniffing::internal::PacketSource>> sources;
    sources.push_back(std::move(source));
    return sources;
}

inline void wait_until_stopped(
    pruftnet::sniffing::internal::SnifferRuntime& runtime,
    std::chrono::milliseconds timeout = std::chrono::seconds(1)) {
    const auto deadline = std::chrono::steady_clock::now() + timeout;
    while (runtime.is_running() && std::chrono::steady_clock::now() < deadline) {
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
    }
    runtime.stop();
}

} // namespace pruftnet::tests

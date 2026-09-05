#include <atomic>
#include <chrono>
#include <iostream>
#include <memory>
#include <thread>
#include "tests/support/fake_packet_source.hpp"
#include "tests/support/runtime_test_support.hpp"

int main() {
  using namespace pruftnet::sniffing::internal;
  using namespace pruftnet::tests;
  for (int trial = 0; trial < 10; ++trial) {
    auto source = std::make_unique<FakePacketSource>();
    source->packets.push_back(fake_packet(64));
    source->after_packets_status = PacketSourceDispatchStatus::NoPacketsAvailable;
    source->no_packets_delay = std::chrono::milliseconds(1);
    auto options = single_interface_options();
    options.spool_flush_interval = std::chrono::milliseconds(8);
    std::atomic<unsigned> callbacks{0};
    std::atomic<long long> callback_us{0};
    auto start = std::chrono::steady_clock::now();
    SnifferRuntime runtime(options, one_source(std::move(source)),
        SnifferOptionsValidation{.require_interface_name = false},
        [&](const auto &, const auto &) { callback_us = std::chrono::duration_cast<std::chrono::microseconds>(std::chrono::steady_clock::now()-start).count(); ++callbacks; }, {});
    start = std::chrono::steady_clock::now();
    if (const auto error = runtime.start()) {
      std::cerr << error->message << '\n';
      return 1;
    }
    std::this_thread::sleep_for(std::chrono::milliseconds(100));
    const auto before = runtime.stats();
    std::cout << "trial=" << trial + 1 << " after_100ms observed="
              << before.packets_observed << " persisted=" << before.packets_persisted
              << " callback_ms=" << callback_us.load()/1000.0 << " analyzed=" << before.packets_analyzed << " callbacks=" << callbacks.load();
    runtime.stop();
    const auto after = runtime.stats();
    std::cout << " after_stop persisted=" << after.packets_persisted
              << " analyzed=" << after.packets_analyzed << " callbacks=" << callbacks.load() << '\n';
  }
}

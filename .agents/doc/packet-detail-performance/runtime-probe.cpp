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
  for (int trial = 0; trial < 7; ++trial) {
    auto source = std::make_unique<FakePacketSource>();
    source->configured_snapshot_length = 128;
    source->packets.assign(50000, fake_packet(128));
    auto options = single_interface_options();
    options.interfaces[0].ring_slots = 65536;
    options.interfaces[0].ring_bytes = 16 * 1024 * 1024;
    options.interfaces[0].snaplen = 128;
    std::atomic<unsigned> callbacks{0};
    SnifferRuntime runtime(options, one_source(std::move(source)),
        SnifferOptionsValidation{.require_interface_name = false},
        [&](const auto &, const auto &) { ++callbacks; }, {});
    const auto start = std::chrono::steady_clock::now();
    if (const auto error = runtime.start()) {
      std::cerr << error->message << '\n';
      return 1;
    }
    wait_until_stopped(runtime, std::chrono::seconds(30));
    const auto milliseconds = std::chrono::duration<double, std::milli>(std::chrono::steady_clock::now()-start).count();
    const auto after = runtime.stats();
    std::size_t indexes = 0;
    for (auto path : runtime.spool_paths()) {
      path += ".pidx";
      indexes += std::filesystem::exists(path);
    }
    std::cout << "trial=" << trial + 1 << " elapsed_ms=" << milliseconds
              << " observed=" << after.packets_observed
              << " persisted=" << after.packets_persisted
              << " analyzed=" << after.packets_analyzed
              << " indexes=" << indexes << " callbacks=" << callbacks.load() << '\n';
  }
}

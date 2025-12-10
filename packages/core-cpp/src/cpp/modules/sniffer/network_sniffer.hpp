#pragma once

#include "../../utils/buffer/ring_buffer.hpp"
#include "../../utils/packets/packet_model.hpp"
#include "./packet_capture.hpp"
#include <atomic>
#include <functional>
#include <memory>
#include <thread>

using PacketCallback = std::function<void(const RawPacket &)>;

class NetworkSniffer {
public:
  NetworkSniffer();
  ~NetworkSniffer();

  bool startSniffing(const std::string &interface_name,
                     const PacketCallback &callback);
  void stopSniffing();
  bool isRunning() const;

private:
  std::unique_ptr<PacketCapture> packet_capture_;
  std::unique_ptr<RingBuffer> ring_buffer_;

  std::thread capture_thread_;
  std::thread processing_thread_;

  std::atomic<bool> is_running_;
  std::atomic<bool> should_stop_;

  PacketCallback packet_callback_;

  void captureWorker();
  void processingWorker();
  void handleRawPacket(const uint8_t *data, size_t length);
};

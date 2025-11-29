#pragma once

#include "../../utils/buffer/ring_buffer.hpp"
#include "../../utils/packets/packet_model.hpp"
#include "../../utils/packets/packet_processing_model.hpp"
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
                     ProcessingModel &processing_model);
  void stop();
  bool isRunning() const;

private:
  std::unique_ptr<PacketCapture> packet_capture_;
  std::unique_ptr<RingBuffer> ring_buffer_;
  ProcessingModel *processing_struct_;

  std::thread capture_thread_;
  std::thread processing_thread_;

  std::atomic<bool> is_running_;
  std::atomic<bool> should_stop_;

  void captureWorker();
  void processingWorker();
  void handleRawPacket(const uint8_t *data, size_t length);
};

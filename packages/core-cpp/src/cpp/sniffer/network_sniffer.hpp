#pragma once

#include "../parser/parser_model.hpp"
#include "../utils/buffer/ring_buffer.hpp"
#include "../utils/packets/packet_model.hpp"
#include "./packet_capture.hpp"
#include <atomic>
#include <memory>
#include <mutex>
#include <thread>

struct PacketCallback {
  virtual ~PacketCallback() = default;
  virtual void operator()(const RawPacket& raw, const ParsedPacket& parsed) const = 0;
};

class NetworkSniffer {
public:
  NetworkSniffer();
  ~NetworkSniffer();

  void setParser(std::unique_ptr<ParserModel> parser);
  ParserModel* getParser() const;
  bool startSniffing(const std::string& interface_name, std::unique_ptr<PacketCallback> callback);
  void stopSniffing();
  bool isRunning() const;

private:
  std::unique_ptr<PacketCapture> packet_capture_;
  std::unique_ptr<RingBuffer> ring_buffer_;
  std::unique_ptr<ParserModel> parser_;

  std::thread capture_thread_;
  std::thread processing_thread_;

  std::atomic<bool> is_running_;
  std::atomic<bool> should_stop_;

  std::unique_ptr<PacketCallback> packet_callback_;
  std::mutex callback_mutex_;

  void captureWorker();
  void processingWorker();
  void handleRawPacket(const uint8_t* data, size_t length);
};

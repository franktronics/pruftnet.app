#include "./network_sniffer.hpp"
#include <cstring>

NetworkSniffer::NetworkSniffer()
    : packet_capture_(nullptr), ring_buffer_(std::make_unique<RingBuffer>()), parser_(nullptr), is_running_(false),
      should_stop_(false) {}

NetworkSniffer::~NetworkSniffer() {
  stopSniffing();
}

bool NetworkSniffer::startSniffing(const std::string& interface_name, std::unique_ptr<PacketCallback> callback) {
  if (is_running_.load()) {
    return false;
  }

  if (!parser_) {
    return false;
  }

  packet_capture_ = std::make_unique<PacketCapture>(interface_name);

  if (!packet_capture_->initialize()) {
    packet_capture_.reset();
    return false;
  }

  {
    std::lock_guard<std::mutex> lock(callback_mutex_);
    packet_callback_ = std::move(callback);
  }

  should_stop_.store(false);
  is_running_.store(true);

  processing_thread_ = std::thread(&NetworkSniffer::processingWorker, this);
  capture_thread_ = std::thread(&NetworkSniffer::captureWorker, this);

  return true;
}

void NetworkSniffer::captureWorker() {
  auto handler = [this](const uint8_t* data, size_t length) { this->handleRawPacket(data, length); };

  packet_capture_->startCapture(handler);
}

void NetworkSniffer::handleRawPacket(const uint8_t* data, size_t length) {
  if (should_stop_.load()) {
    return;
  }

  RawPacket packet;
  packet.length = length;
  packet.valid = true;

  if (length <= MAX_PACKET_SIZE) {
    std::memcpy(packet.data.data(), data, length);
    ring_buffer_->push(packet);
  }
}

void NetworkSniffer::processingWorker() {
  while (!should_stop_.load()) {
    RawPacket raw_packet;

    if (ring_buffer_->pop(raw_packet)) {
      ParsedPacket parsed = parser_->parsePacket(raw_packet);

      PacketCallback* callback_ptr = nullptr;
      {
        std::lock_guard<std::mutex> lock(callback_mutex_);
        callback_ptr = packet_callback_.get();
      }

      if (callback_ptr != nullptr) {
        (*callback_ptr)(raw_packet, parsed);
      }
    } else {
      ring_buffer_->waitForData(std::chrono::milliseconds(100));
    }
  }

  RawPacket raw_packet;
  while (ring_buffer_->pop(raw_packet)) {
    ParsedPacket parsed = parser_->parsePacket(raw_packet);

    PacketCallback* callback_ptr = nullptr;
    {
      std::lock_guard<std::mutex> lock(callback_mutex_);
      callback_ptr = packet_callback_.get();
    }

    if (callback_ptr != nullptr) {
      (*callback_ptr)(raw_packet, parsed);
    }
  }
}

void NetworkSniffer::stopSniffing() {
  if (!is_running_.load()) {
    return;
  }

  should_stop_.store(true);

  if (packet_capture_) {
    packet_capture_->stopCapture();
  }

  ring_buffer_->notifyConsumer();

  if (capture_thread_.joinable()) {
    capture_thread_.join();
  }

  if (processing_thread_.joinable()) {
    processing_thread_.join();
  }

  {
    std::lock_guard<std::mutex> lock(callback_mutex_);
    packet_callback_ = nullptr;
  }

  packet_capture_.reset();
  is_running_.store(false);
}

bool NetworkSniffer::isRunning() const {
  return is_running_.load();
}

void NetworkSniffer::setParser(std::unique_ptr<ParserModel> parser) {
  if (is_running_.load()) {
    return;
  }
  parser_ = std::move(parser);
}

ParserModel* NetworkSniffer::getParser() const {
  return parser_.get();
}
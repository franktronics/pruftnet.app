#pragma once

#include <functional>
#include <thread>
#include <atomic>
#include <memory>
#include "../../utils/network_interface/n_interface_model.hpp"
#include "../../utils/packets/packet_model.hpp"
#include "../../utils/buffer/ring_buffer.hpp"
#include "packet_capture.hpp"

using PacketCallback = std::function<void(const RawPacket&)>;

class NetworkSniffer {
public:
    NetworkSniffer();
    ~NetworkSniffer();

    bool startSniffing(const NetworkInterface& interface, const PacketCallback& callback);
    void stop();
    bool isRunning() const;

private:
    std::unique_ptr<PacketCapture> packet_capture_;
    std::unique_ptr<RingBuffer> ring_buffer_;
    PacketCallback packet_callback_;
    
    std::thread capture_thread_;
    std::thread processing_thread_;
    
    std::atomic<bool> is_running_;
    std::atomic<bool> should_stop_;
    
    void captureWorker();
    void processingWorker();
    void handleRawPacket(const uint8_t* data, size_t length);
};


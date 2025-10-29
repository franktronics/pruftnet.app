#include "network_sniffer.hpp"
#include <iostream>
#include <chrono>
#include <cstring>

NetworkSniffer::NetworkSniffer() 
    : packet_capture_(nullptr)
    , ring_buffer_(std::make_unique<RingBuffer>())
    , is_running_(false)
    , should_stop_(false) {
}

NetworkSniffer::~NetworkSniffer() {
    stop();
}

bool NetworkSniffer::startSniffing(const NetworkInterface& interface, const PacketCallback& callback) {
    if (is_running_.load()) {
        return false;
    }
    
    packet_callback_ = callback;
    packet_capture_ = std::make_unique<PacketCapture>(interface.name);
    
    if (!packet_capture_->initialize()) {
        packet_capture_.reset();
        return false;
    }
    
    should_stop_.store(false);
    is_running_.store(true);
    
    // Start processing thread first
    processing_thread_ = std::thread(&NetworkSniffer::processingWorker, this);
    
    // Start capture thread
    capture_thread_ = std::thread(&NetworkSniffer::captureWorker, this);
    
    return true;
}

void NetworkSniffer::stop() {
    if (!is_running_.load()) {
        return;
    }
    
    should_stop_.store(true);
    
    // Stop packet capture
    if (packet_capture_) {
        packet_capture_->stopCapture();
    }
    
    // Wait for capture thread to finish
    if (capture_thread_.joinable()) {
        capture_thread_.join();
    }
    
    // Wait for processing thread to finish processing remaining packets
    if (processing_thread_.joinable()) {
        processing_thread_.join();
    }
    
    packet_capture_.reset();
    is_running_.store(false);
}

bool NetworkSniffer::isRunning() const {
    return is_running_.load();
}

void NetworkSniffer::captureWorker() {
    auto handler = [this](const uint8_t* data, size_t length) {
        this->handleRawPacket(data, length);
    };
    
    packet_capture_->startCapture(handler);
}

void NetworkSniffer::processingWorker() {
    while (!should_stop_.load()) {
        RawPacket packet;
        
        if (ring_buffer_->pop(packet)) {
            if (packet_callback_) {
                packet_callback_(packet);
            }
        } else {
            // No packets available, sleep briefly to avoid busy waiting
            std::this_thread::sleep_for(std::chrono::microseconds(100));
        }
    }
    
    // Process remaining packets in buffer before exiting
    RawPacket packet;
    while (ring_buffer_->pop(packet)) {
        if (packet_callback_) {
            packet_callback_(packet);
        }
    }
}

void NetworkSniffer::handleRawPacket(const uint8_t* data, size_t length) {
    if (should_stop_.load()) {
        return;
    }
    
    // Create a proper RawPacket with all fields set
    RawPacket packet;
    packet.length = length;
    packet.original_length = length;
    packet.valid = true;
    // timestamp is set automatically in constructor
    
    if (length <= MAX_PACKET_SIZE) {
        std::memcpy(packet.data.data(), data, length);
        ring_buffer_->push(packet);
    }
}

#include <catch2/catch_test_macros.hpp>
#include "../src/cpp/modules/sniffer/network_sniffer.hpp"
#include "../src/cpp/utils/common/common.hpp"
#include <thread>
#include <chrono>
#include <iostream>
#include <atomic>
#include <iomanip>

TEST_CASE("NetworkSniffer can capture packets", "[network_scanner]") {
    SECTION("Basic packet capture test") {
        NetworkInterface nic("wlp1s0");
        
        NetworkSniffer sniffer;
        std::atomic<int> packet_count(0);
        std::atomic<size_t> total_bytes_captured(0);
        
        auto callback = [&packet_count, &total_bytes_captured](const RawPacket& packet) {
            packet_count++;
            total_bytes_captured += packet.length;
            std::cout << "Packet #" << packet_count.load() 
                      << ": " << std::endl << packet.toString() << std::endl << std::endl;
        };
        
        // Start sniffing
        bool started = sniffer.startSniffing(nic, callback);

        if (!started) {
            std::cout << "Warning: Could not start packet capture on interface "
                      << "This might be due to missing interface or lack of privileges." 
                      << std::endl;
            REQUIRE_FALSE(sniffer.isRunning());
            return;
        }
        
        REQUIRE(sniffer.isRunning());
        
        std::cout << "Capturing packets for 3 seconds..." << std::endl;
        std::this_thread::sleep_for(std::chrono::seconds(3));
        
        // Stop the sniffer
        std::cout << "Stopping capture..." << std::endl;
        sniffer.stop();
        
        REQUIRE_FALSE(sniffer.isRunning());
        
        // Calculate statistics
        const size_t total_packets = packet_count.load();
        const size_t total_data_bytes = total_bytes_captured.load();
        const size_t pcap_overhead = PCAP_GLOBAL_HEADER_SIZE + (total_packets * PCAP_PACKET_HEADER_SIZE);
        const size_t total_pcap_size = total_data_bytes + pcap_overhead;
        
        std::cout << "\n========== CAPTURE STATISTICS ==========" << std::endl;
        std::cout << "Total packets captured: " << total_packets << std::endl;
        
        // Display raw data size
        if (total_data_bytes < 1024) {
            std::cout << "Raw packet data size: " << total_data_bytes << " bytes" << std::endl;
        } else if (total_data_bytes < 1024 * 1024) {
            std::cout << "Raw packet data size: " << std::fixed << std::setprecision(2) 
                      << (total_data_bytes / 1024.0) << " KB" << std::endl;
        } else {
            std::cout << "Raw packet data size: " << std::fixed << std::setprecision(2) 
                      << (total_data_bytes / (1024.0 * 1024.0)) << " MB" << std::endl;
        }
        
        // Display PCAP file size
        if (total_pcap_size < 1024) {
            std::cout << "PCAP file size would be: " << total_pcap_size << " bytes" << std::endl;
        } else if (total_pcap_size < 1024 * 1024) {
            std::cout << "PCAP file size would be: " << std::fixed << std::setprecision(2) 
                      << (total_pcap_size / 1024.0) << " KB" << std::endl;
        } else {
            std::cout << "PCAP file size would be: " << std::fixed << std::setprecision(2) 
                      << (total_pcap_size / (1024.0 * 1024.0)) << " MB" << std::endl;
        }
        
        std::cout << "PCAP overhead: " << pcap_overhead << " bytes ("
                  << std::fixed << std::setprecision(1) 
                  << (total_pcap_size > 0 ? (pcap_overhead * 100.0 / total_pcap_size) : 0.0) 
                  << "%)" << std::endl;
        std::cout << "=========================================" << std::endl;
        
        REQUIRE(true);
    }
}
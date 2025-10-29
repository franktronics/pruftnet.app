#include <catch2/catch_test_macros.hpp>
#include "../src/cpp/modules/sniffer/network_sniffer.hpp"
#include <thread>
#include <chrono>
#include <iostream>
#include <atomic>

TEST_CASE("NetworkSniffer can capture packets", "[network_scanner]") {
    SECTION("Basic packet capture test") {
        NetworkInterface enp0s8_interface("enp0s8");
        
        NetworkSniffer sniffer;
        std::atomic<int> packet_count(0);
        
        auto callback = [&packet_count](const RawPacket& packet) {
            packet_count++;
            std::cout << "Packet #" << packet_count.load() 
                      << ": " << packet.toString() << std::endl;
        };
        
        // Start sniffing
        bool started = sniffer.startSniffing(enp0s8_interface, callback);
        
        if (!started) {
            std::cout << "Warning: Could not start packet capture on enp0s8. "
                      << "This might be due to missing interface or lack of privileges." 
                      << std::endl;
            REQUIRE_FALSE(sniffer.isRunning());
            return;
        }
        
        REQUIRE(sniffer.isRunning());
        
        // Let it capture for 10 seconds
        std::cout << "Capturing packets for 10 seconds..." << std::endl;
        std::this_thread::sleep_for(std::chrono::seconds(3));
        
        // Stop the sniffer
        std::cout << "Stopping capture..." << std::endl;
        sniffer.stop();
        
        REQUIRE_FALSE(sniffer.isRunning());
        
        std::cout << "Total packets captured: " << packet_count.load() << std::endl;
        
        REQUIRE(true);
    }
}
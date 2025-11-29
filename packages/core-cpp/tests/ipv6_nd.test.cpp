#include <catch2/catch_test_macros.hpp>
#include "modules/analyser/ipv6_nd/ipv6_ns.hpp"
#include "modules/analyser/ipv6_nd/ipv6_rs.hpp"
#include <iostream>
#include <thread>
#include <chrono>

TEST_CASE("IPv6 Neighbor Solicitation", "[ipv6_nd][ipv6_ns]") {
    
    SECTION("Send NS using new API") {
        std::string interface = "enp2s0";
        IPv6NeighborSolicitation ns;
        
        std::array<uint8_t, 6> source_mac = {0x20, 0x47, 0x47, 0x52, 0xe0, 0xcf};
        std::string source_ipv6 = "fe80::2247:47ff:fe52:e0cf";
        std::string target_ipv6 = "ff02::1";
        
        std::cout << "\n=== Starting IPv6 Neighbor Solicitation Test ===" << std::endl;
        std::cout << "Interface: " << interface << std::endl;
        std::cout << "Source IPv6: " << source_ipv6 << std::endl;
        std::cout << "Target IPv6: " << target_ipv6 << std::endl;
        std::cout << "Source MAC: ";
        for (size_t i = 0; i < 6; ++i) {
            printf("%02x", source_mac[i]);
            if (i < 5) std::cout << ":";
        }
        std::cout << "\n" << std::endl;
        
        ns.setTargetIPv6(target_ipv6);
        ns.setSourceIPv6(source_ipv6);
        ns.setSourceMAC(source_mac);
        
        bool result = ns.analyze(interface);
        
        REQUIRE(result == true);
        
        std::this_thread::sleep_for(std::chrono::milliseconds(500));
        
        ns.stop();
        REQUIRE(ns.isRunning() == false);
        
        std::cout << "\n=== Test completed ===" << std::endl;
    }
    
    SECTION("Constructor and destructor") {
        IPv6NeighborSolicitation ns;
        REQUIRE(ns.isRunning() == false);
    }
    
    SECTION("Validate setter methods") {
        IPv6NeighborSolicitation ns;
        std::array<uint8_t, 6> mac = {0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff};
        
        ns.setTargetIPv6("fe80::2");
        ns.setSourceIPv6("fe80::1");
        ns.setSourceMAC(mac);
        
        REQUIRE(ns.isRunning() == false);
    }
}

TEST_CASE("IPv6 Router Solicitation", "[ipv6_nd][ipv6_rs]") {
    
    SECTION("Send RS using new API") {
        std::string interface = "enp2s0";
        IPv6RouterSolicitation rs;
        
        std::array<uint8_t, 6> source_mac = {0x20, 0x47, 0x47, 0x52, 0xe0, 0xcf};
        std::string source_ipv6 = "fe80::2247:47ff:fe52:e0cf";
        
        std::cout << "\n=== Starting IPv6 Router Solicitation Test ===" << std::endl;
        std::cout << "Interface: " << interface << std::endl;
        std::cout << "Source IPv6: " << source_ipv6 << std::endl;
        std::cout << "Source MAC: ";
        for (size_t i = 0; i < 6; ++i) {
            printf("%02x", source_mac[i]);
            if (i < 5) std::cout << ":";
        }
        std::cout << "\n" << std::endl;
        
        rs.setSourceIPv6(source_ipv6);
        rs.setSourceMAC(source_mac);
        
        bool result = rs.analyze(interface);
        
        REQUIRE(result == true);
        
        std::this_thread::sleep_for(std::chrono::milliseconds(500));
        
        rs.stop();
        REQUIRE(rs.isRunning() == false);
        
        std::cout << "\n=== Test completed ===" << std::endl;
    }
    
    SECTION("Constructor and destructor") {
        IPv6RouterSolicitation rs;
        REQUIRE(rs.isRunning() == false);
    }
    
    SECTION("Validate setter methods") {
        IPv6RouterSolicitation rs;
        std::array<uint8_t, 6> mac = {0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff};
        
        rs.setSourceIPv6("fe80::1");
        rs.setSourceMAC(mac);
        
        REQUIRE(rs.isRunning() == false);
    }
}


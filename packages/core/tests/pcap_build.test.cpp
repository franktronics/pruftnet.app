#include <catch2/catch_test_macros.hpp>
#include "../src/cpp/utils/cap_file_builder/pcap_builder.hpp"
#include <filesystem>
#include <fstream>

TEST_CASE("PcapBuilder can create and write PCAP files", "[pcap_builder]") {
    const std::string test_filename = "testpcap.pcap";
    
    // Clean up any existing test file
    if (std::filesystem::exists(test_filename)) {
        std::filesystem::remove(test_filename);
    }
    
    SECTION("Basic file creation and writing") {
        PcapBuilder builder(test_filename);
        
        // Test opening the file
        REQUIRE(builder.open());
        REQUIRE(builder.isOpen());
        
        // Create fake packets
        RawPacket packet1;
        packet1.valid = true;
        packet1.length = 64;
        packet1.original_length = 64;
        // Fill with some dummy Ethernet frame data
        for (size_t i = 0; i < packet1.length; ++i) {
            packet1.data[i] = static_cast<uint8_t>(i % 256);
        }
        
        RawPacket packet2;
        packet2.valid = true;
        packet2.length = 128;
        packet2.original_length = 1500; // Simulating a truncated packet
        // Fill with different dummy data
        for (size_t i = 0; i < packet2.length; ++i) {
            packet2.data[i] = static_cast<uint8_t>((i * 2) % 256);
        }
        
        RawPacket packet3;
        packet3.valid = true;
        packet3.length = 256;
        packet3.original_length = 256;
        // Fill with another pattern
        for (size_t i = 0; i < packet3.length; ++i) {
            packet3.data[i] = static_cast<uint8_t>(255 - (i % 256));
        }
        
        // Write packets
        REQUIRE(builder.writePacket(packet1));
        REQUIRE(builder.writePacket(packet2));
        REQUIRE(builder.writePacket(packet3));
        
        // Close the file
        builder.close();
        REQUIRE_FALSE(builder.isOpen());
        
        // Verify the file exists and has content
        REQUIRE(std::filesystem::exists(test_filename));
        
        std::ifstream file(test_filename, std::ios::binary | std::ios::ate);
        REQUIRE(file.is_open());
        
        // Check file size (should be > 24 bytes for global header + packet data)
        auto file_size = file.tellg();
        REQUIRE(file_size > 24); // At least the global header
        
        file.close();
    }
    
    SECTION("Invalid packet handling") {
        PcapBuilder builder(test_filename);
        REQUIRE(builder.open());
        
        // Test invalid packet (not valid)
        RawPacket invalid_packet;
        invalid_packet.valid = false;
        invalid_packet.length = 64;
        REQUIRE_FALSE(builder.writePacket(invalid_packet));
        
        // Test zero-length packet
        RawPacket zero_packet;
        zero_packet.valid = true;
        zero_packet.length = 0;
        REQUIRE_FALSE(builder.writePacket(zero_packet));
        
        builder.close();
    }
    
    SECTION("File operations") {
        PcapBuilder builder(test_filename);
        
        // Test writing without opening
        RawPacket packet;
        packet.valid = true;
        packet.length = 64;
        REQUIRE_FALSE(builder.writePacket(packet));
        
        // Test double open
        REQUIRE(builder.open());
        REQUIRE_FALSE(builder.open()); // Should fail on second open
        
        builder.close();
    }
    
    // Clean up test file
    if (std::filesystem::exists(test_filename)) {
        std::filesystem::remove(test_filename);
    }
}
/*

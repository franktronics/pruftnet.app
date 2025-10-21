#include <catch2/catch_test_macros.hpp>

#include "utils/buffer/ring_buffer.hpp"
#include <vector>
#include <cstring>

// Helper function to create test data
std::vector<uint8_t> createTestData(size_t size, uint8_t fillValue = 0x42) {
    std::vector<uint8_t> data(size);
    for (size_t i = 0; i < size; ++i) {
        data[i] = static_cast<uint8_t>(fillValue + (i % 256));
    }
    return data;
}

// Helper function to check if two packets are equal
bool packetsEqual(const RawPacket& a, const RawPacket& b) {
    if (a.length != b.length || a.valid != b.valid) {
        return false;
    }
    return std::memcmp(a.data.data(), b.data.data(), a.length) == 0;
}

TEST_CASE("RingBuffer basic operations", "[ring_buffer]") {
    
    SECTION("Basic push and pop") {
        RingBuffer buffer;
        auto testData = createTestData(100);
        
        // Push data
        bool pushResult = buffer.push(testData.data(), testData.size());
        REQUIRE(pushResult == true);
        
        // Pop data
        RawPacket output;
        bool popResult = buffer.pop(output);
        REQUIRE(popResult == true);
        REQUIRE(output.length == testData.size());
        REQUIRE(output.valid == true);
        
        // Verify content
        for (size_t i = 0; i < testData.size(); ++i) {
            REQUIRE(output.data[i] == testData[i]);
        }
    }
    
    SECTION("Empty buffer pop returns false") {
        RingBuffer buffer;
        RawPacket output;
        
        // Attempt to pop from empty buffer
        bool result = buffer.pop(output);
        REQUIRE(result == false);
    }
    
    SECTION("Oversized packet rejected") {
        RingBuffer buffer;
        auto largeData = createTestData(MAX_PACKET_SIZE + 1);
        
        // Attempt to push oversized packet
        bool result = buffer.push(largeData.data(), largeData.size());
        REQUIRE(result == false);
    }
    
    SECTION("Maximum size packet accepted") {
        RingBuffer buffer;
        auto maxData = createTestData(MAX_PACKET_SIZE);
        
        // Push maximum size packet
        bool pushResult = buffer.push(maxData.data(), maxData.size());
        REQUIRE(pushResult == true);
        
        // Verify we can pop it back
        RawPacket output;
        bool popResult = buffer.pop(output);
        REQUIRE(popResult == true);
        REQUIRE(output.length == MAX_PACKET_SIZE);
    }
}

TEST_CASE("RingBuffer FIFO behavior", "[ring_buffer]") {
    
    SECTION("Multiple packets maintain FIFO order") {
        RingBuffer buffer;
        std::vector<std::vector<uint8_t>> testPackets;
        
        // Create and push multiple test packets
        for (int i = 0; i < 5; ++i) {
            auto packet = createTestData(50 + i * 10, 0x10 + i);
            testPackets.push_back(packet);
            bool pushResult = buffer.push(packet.data(), packet.size());
            REQUIRE(pushResult == true);
        }
        
        // Verify they come out in FIFO order
        for (int i = 0; i < 5; ++i) {
            RawPacket output;
            bool result = buffer.pop(output);
            REQUIRE(result == true);
            REQUIRE(output.length == testPackets[i].size());
            
            for (size_t j = 0; j < testPackets[i].size(); ++j) {
                REQUIRE(output.data[j] == testPackets[i][j]);
            }
        }
        
        // Buffer should be empty now
        RawPacket output;
        REQUIRE(buffer.pop(output) == false);
    }
}

TEST_CASE("RingBuffer overflow behavior", "[ring_buffer]") {
    
    SECTION("Buffer overflow overwrites oldest entries") {
        RingBuffer buffer;
        auto testData = createTestData(100);
        
        // Fill buffer beyond capacity (RING_SIZE = 128)
        for (size_t i = 0; i < RING_SIZE + 10; ++i) {
            bool pushResult = buffer.push(testData.data(), testData.size());
            REQUIRE(pushResult == true);
        }
        
        // Count how many packets we can pop
        size_t popCount = 0;
        RawPacket output;
        while (buffer.pop(output)) {
            popCount++;
            REQUIRE(popCount <= RING_SIZE); // Prevent infinite loop
        }
        
        // Should have popped less than RING_SIZE due to overwriting
        REQUIRE(popCount < RING_SIZE);
    }
}



TEST_CASE("RingBuffer edge cases", "[ring_buffer]") {
    
    SECTION("Zero-length packet") {
        RingBuffer buffer;
        
        // Push zero-length packet
        bool pushResult = buffer.push(nullptr, 0);
        REQUIRE(pushResult == true);
        
        // Pop and verify
        RawPacket output;
        bool popResult = buffer.pop(output);
        REQUIRE(popResult == true);
        REQUIRE(output.length == 0);
        REQUIRE(output.valid == true);
    }
    
    SECTION("Single byte packet") {
        RingBuffer buffer;
        uint8_t singleByte = 0xAB;
        
        // Push single byte
        bool pushResult = buffer.push(&singleByte, 1);
        REQUIRE(pushResult == true);
        
        // Pop and verify
        RawPacket output;
        bool popResult = buffer.pop(output);
        REQUIRE(popResult == true);
        REQUIRE(output.length == 1);
        REQUIRE(output.data[0] == 0xAB);
        REQUIRE(output.valid == true);
    }
    
    SECTION("Alternating push and pop") {
        RingBuffer buffer;
        
        for (int i = 0; i < 10; ++i) {
            auto data = createTestData(10, i);
            
            // Push
            bool pushResult = buffer.push(data.data(), data.size());
            REQUIRE(pushResult == true);
            
            // Immediately pop
            RawPacket output;
            bool popResult = buffer.pop(output);
            REQUIRE(popResult == true);
            REQUIRE(output.length == data.size());
            
            // Verify content
            for (size_t j = 0; j < data.size(); ++j) {
                REQUIRE(output.data[j] == data[j]);
            }
        }
    }
}

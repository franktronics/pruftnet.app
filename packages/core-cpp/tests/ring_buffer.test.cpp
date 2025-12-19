#include <catch2/catch_test_macros.hpp>

#include "utils/buffer/ring_buffer.hpp"
#include <atomic>
#include <chrono>
#include <cstring>
#include <thread>
#include <vector>

// Helper function to create test data
std::vector<uint8_t> createTestData(size_t size, uint8_t fillValue = 0x42) {
  std::vector<uint8_t> data(size);
  for (size_t i = 0; i < size; ++i) {
    data[i] = static_cast<uint8_t>(fillValue + (i % 256));
  }
  return data;
}

// Helper function to create a RawPacket from test data
RawPacket createRawPacket(const std::vector<uint8_t> &data) {
  RawPacket packet;
  packet.length = std::min(data.size(), static_cast<size_t>(MAX_PACKET_SIZE));
  packet.original_length = data.size();
  packet.valid = true;
  packet.timestamp = std::chrono::system_clock::now();
  std::memcpy(packet.data.data(), data.data(), packet.length);
  return packet;
}

// Helper function to create an empty RawPacket
RawPacket createEmptyRawPacket() {
  RawPacket packet;
  packet.length = 0;
  packet.original_length = 0;
  packet.valid = true;
  packet.timestamp = std::chrono::system_clock::now();
  return packet;
}

// Helper function to check if two packets are equal
bool packetsEqual(const RawPacket &a, const RawPacket &b) {
  if (a.length != b.length || a.valid != b.valid) {
    return false;
  }
  return std::memcmp(a.data.data(), b.data.data(), a.length) == 0;
}

TEST_CASE("RingBuffer basic operations", "[ring_buffer]") {

  SECTION("Basic push and pop") {
    RingBuffer buffer;
    auto testData = createTestData(100);
    RawPacket packet = createRawPacket(testData);

    // Push data
    bool pushResult = buffer.push(packet);
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

  SECTION("Maximum size packet accepted") {
    RingBuffer buffer;
    auto maxData = createTestData(MAX_PACKET_SIZE);
    RawPacket packet = createRawPacket(maxData);

    // Push maximum size packet
    bool pushResult = buffer.push(packet);
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
      auto packetData = createTestData(50 + i * 10, 0x10 + i);
      testPackets.push_back(packetData);
      RawPacket packet = createRawPacket(packetData);
      bool pushResult = buffer.push(packet);
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
    RawPacket packet = createRawPacket(testData);

    // Fill buffer beyond capacity (RING_SIZE = 128)
    for (size_t i = 0; i < RING_SIZE + 10; ++i) {
      bool pushResult = buffer.push(packet);
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
    RawPacket packet = createEmptyRawPacket();

    // Push zero-length packet
    bool pushResult = buffer.push(packet);
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
    std::vector<uint8_t> singleByteData = {0xAB};
    RawPacket packet = createRawPacket(singleByteData);

    // Push single byte
    bool pushResult = buffer.push(packet);
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
      RawPacket packet = createRawPacket(data);

      // Push
      bool pushResult = buffer.push(packet);
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

TEST_CASE("RingBuffer multithreading", "[ring_buffer][multithread]") {

  SECTION("Simple producer-consumer") {
    RingBuffer buffer;
    const int numPackets = 20; // Keep it small for fast execution
    std::atomic<int> packetsWritten(0);
    std::atomic<int> packetsRead(0);

    // Producer thread
    std::thread producer([&buffer, &packetsWritten]() {
      for (int i = 0; i < 20; ++i) {
        auto data = createTestData(10, static_cast<uint8_t>(i));
        RawPacket packet = createRawPacket(data);

        // Simple retry logic
        while (!buffer.push(packet)) {
          std::this_thread::sleep_for(std::chrono::microseconds(10));
        }
        packetsWritten++;
      }
    });

    // Consumer thread
    std::thread consumer([&buffer, &packetsRead]() {
      RawPacket output;
      while (packetsRead < 20) {
        if (buffer.pop(output)) {
          packetsRead++;
        } else {
          std::this_thread::sleep_for(std::chrono::microseconds(10));
        }
      }
    });

    // Wait for both threads to complete
    producer.join();
    consumer.join();

    // Verify all packets were processed
    REQUIRE(packetsWritten == numPackets);
    REQUIRE(packetsRead == numPackets);
  }
}

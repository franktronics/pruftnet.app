# PCAP Builder Usage Example

## Basic Usage

```cpp
#include "utils/cap_file_builder/pcap_builder.hpp"
#include "utils/packets/packet_model.hpp"

// Create a PCAP builder
PcapBuilder builder("capture.pcap");

// Open the file for writing
if (!builder.open()) {
    // Handle error
    return false;
}

// Create and write packets
RawPacket packet;
packet.valid = true;
packet.length = 64;
packet.original_length = 64;
// Fill packet.data with actual network data...

// Write the packet
builder.writePacket(packet);

// Close when done
builder.close();
```

## Thread-Safe Usage Pattern

```cpp
// In capture thread:
void captureThread() {
    PcapBuilder builder("network_capture.pcap");
    if (!builder.open()) return;
    
    while (capturing) {
        RawPacket packet = captureFromNetwork();
        if (packet.valid) {
            builder.writePacket(packet);
        }
    }
    
    builder.close();
}
```

## Key Features

- **Automatic timestamp handling**: Timestamps are set automatically when creating RawPacket
- **Thread-safe design**: Each PcapBuilder instance manages its own file
- **Proper PCAP format**: Compatible with Wireshark and other PCAP analyzers
- **Error handling**: All operations return status codes for proper error management
- **Memory efficient**: Streams data directly to file without buffering entire capture
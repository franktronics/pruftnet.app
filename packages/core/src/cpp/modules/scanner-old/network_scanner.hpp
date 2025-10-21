#pragma once

#include <string>
#include <thread>
#include <queue>
#include <mutex>
#include <atomic>
#include <condition_variable>
#include <functional>
#include <vector>
#include <chrono>
#include <sys/socket.h>
#include <linux/if_packet.h>
#include <net/ethernet.h>

namespace PruftNet {
    
    struct PacketData {
        std::vector<uint8_t> data;
        uint32_t length;
        std::chrono::high_resolution_clock::time_point timestamp;
        std::string source_interface;
        
        PacketData() = default;
        PacketData(const uint8_t* packet, uint32_t len, const std::string& interface)
            : data(packet, packet + len), 
              length(len),
              timestamp(std::chrono::high_resolution_clock::now()),
              source_interface(interface) {}
    };
    
    using PacketCallback = std::function<void(const PacketData&)>;
    
    class NetworkScanner {
    public:
        NetworkScanner();
        ~NetworkScanner();
        
        // Interface publique
        bool start_scan(const std::string& nic, PacketCallback callback);
        void stop_scan();
        
        // Statistiques
        uint64_t get_total_packets() const { return total_packets_.load(); }
        uint64_t get_dropped_packets() const { return dropped_packets_.load(); }
        size_t get_queue_size() const;
        
    private:
        // Configuration
        static constexpr size_t MAX_QUEUE_SIZE = 50000;
        static constexpr size_t PACKET_BUFFER_SIZE = 65536; // Max Ethernet frame
        
        // Données des paquets
        std::queue<PacketData> packet_queue_;
        mutable std::mutex queue_mutex_;
        std::condition_variable queue_condition_;
        
        // Threads
        std::thread capture_thread_;
        std::thread processing_thread_;
        
        // État
        std::atomic<bool> is_running_{false};
        std::atomic<bool> is_capturing_{false};
        std::atomic<bool> is_processing_{false};
        
        // Socket et interface
        int raw_socket_;
        std::string current_interface_;
        PacketCallback packet_callback_;
        
        // Statistiques
        std::atomic<uint64_t> total_packets_{0};
        std::atomic<uint64_t> dropped_packets_{0};
        
        // Méthodes privées
        bool initialize_socket(const std::string& interface);
        void cleanup_socket();
        
        // Thread 1: Capture ultra-rapide
        void capture_loop();
        
        // Thread 2: Traitement des paquets
        void processing_loop();
        
        // Utilitaires
        bool push_packet(const PacketData& packet);
        bool pop_packet(PacketData& packet);
        void clear_queue();
    };
    
} // namespace PruftNet
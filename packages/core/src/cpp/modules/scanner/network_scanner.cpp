#include "network_scanner.hpp"
#include <sys/socket.h>
#include <linux/if_packet.h>
#include <net/ethernet.h>
#include <netinet/in.h>
#include <arpa/inet.h>
#include <ifaddrs.h>
#include <unistd.h>
#include <iostream>
#include <cstring>
#include <cerrno>

namespace PruftNet {

NetworkScanner::NetworkScanner() 
    : raw_socket_(-1) {
}

NetworkScanner::~NetworkScanner() {
    stop_scan();
}

bool NetworkScanner::start_scan(const std::string& nic, PacketCallback callback) {
    if (is_running_.load()) {
        std::cerr << "Scanner is already running" << std::endl;
        return false;
    }
    
    current_interface_ = nic;
    packet_callback_ = callback;
    
    // Initialiser le socket raw
    if (!initialize_socket(nic)) {
        std::cerr << "Failed to initialize socket for interface: " << nic << std::endl;
        return false;
    }
    
    // Démarrer le scanner
    is_running_.store(true);
    is_capturing_.store(true);
    is_processing_.store(true);
    
    // Thread 1: Capture ultra-rapide
    capture_thread_ = std::thread(&NetworkScanner::capture_loop, this);
    
    // Thread 2: Traitement des paquets
    processing_thread_ = std::thread(&NetworkScanner::processing_loop, this);
    
    std::cout << "Network scanner started on interface: " << nic << std::endl;
    return true;
}

void NetworkScanner::stop_scan() {
    if (!is_running_.load()) {
        return;
    }
    
    std::cout << "Stopping network scanner..." << std::endl;
    
    // Arrêter les threads
    is_capturing_.store(false);
    is_processing_.store(false);
    is_running_.store(false);
    
    // Réveiller le thread de traitement
    queue_condition_.notify_all();
    
    // Attendre que les threads se terminent
    if (capture_thread_.joinable()) {
        capture_thread_.join();
    }
    
    if (processing_thread_.joinable()) {
        processing_thread_.join();
    }
    
    // Vider la queue des derniers paquets
    clear_queue();
    
    // Nettoyer le socket
    cleanup_socket();
    
    std::cout << "Network scanner stopped" << std::endl;
    std::cout << "Total packets processed: " << total_packets_.load() << std::endl;
    std::cout << "Dropped packets: " << dropped_packets_.load() << std::endl;
}

bool NetworkScanner::initialize_socket(const std::string& interface) {
    // Créer socket raw pour couche 2 (tous les paquets Ethernet)
    raw_socket_ = socket(AF_PACKET, SOCK_RAW, htons(ETH_P_ALL));
    if (raw_socket_ < 0) {
        std::cerr << "Failed to create raw socket: " << strerror(errno) << std::endl;
        return false;
    }
    
    // Augmenter la taille du buffer de réception
    int buffer_size = 64 * 1024 * 1024; // 64MB
    if (setsockopt(raw_socket_, SOL_SOCKET, SO_RCVBUF, &buffer_size, sizeof(buffer_size)) < 0) {
        std::cerr << "Warning: Failed to set socket buffer size" << std::endl;
    }
    
    // Si une interface spécifique est demandée, on pourrait la bind ici
    // Pour l'instant, on capture sur toutes les interfaces
    
    std::cout << "Raw socket initialized successfully" << std::endl;
    return true;
}

void NetworkScanner::cleanup_socket() {
    if (raw_socket_ >= 0) {
        close(raw_socket_);
        raw_socket_ = -1;
    }
}

void NetworkScanner::capture_loop() {
    uint8_t packet_buffer[PACKET_BUFFER_SIZE];
    struct sockaddr_ll saddr;
    socklen_t saddr_len = sizeof(saddr);
    
    std::cout << "Capture thread started" << std::endl;
    
    while (is_capturing_.load()) {
        // Lecture ultra-rapide du socket
        ssize_t packet_size = recvfrom(raw_socket_, packet_buffer, sizeof(packet_buffer), 
                                     0, (struct sockaddr*)&saddr, &saddr_len);
        
        if (packet_size > 0) {
            // OPÉRATION ULTRA-RAPIDE: juste copier en mémoire
            PacketData packet(packet_buffer, static_cast<uint32_t>(packet_size), current_interface_);
            
            if (!push_packet(packet)) {
                // Queue pleine - incrémenter le compteur de paquets perdus
                dropped_packets_.fetch_add(1);
            }
            
            total_packets_.fetch_add(1);
        } else if (packet_size < 0 && errno != EAGAIN && errno != EWOULDBLOCK) {
            if (is_capturing_.load()) {
                std::cerr << "Error reading packet: " << strerror(errno) << std::endl;
            }
            break;
        }
    }
    
    std::cout << "Capture thread stopped" << std::endl;
}

void NetworkScanner::processing_loop() {
    std::cout << "Processing thread started" << std::endl;
    
    while (is_processing_.load()) {
        PacketData packet;
        
        if (pop_packet(packet)) {
            // ICI on peut prendre tout le temps nécessaire
            // Appeler la callback JavaScript
            if (packet_callback_) {
                try {
                    packet_callback_(packet);
                } catch (const std::exception& e) {
                    std::cerr << "Error in packet callback: " << e.what() << std::endl;
                }
            }
        }
    }
    
    std::cout << "Processing thread stopped" << std::endl;
}

bool NetworkScanner::push_packet(const PacketData& packet) {
    std::unique_lock<std::mutex> lock(queue_mutex_);
    
    if (packet_queue_.size() >= MAX_QUEUE_SIZE) {
        return false; // Queue full
    }
    
    packet_queue_.push(packet);
    
    lock.unlock();
    queue_condition_.notify_one();
    return true;
}

bool NetworkScanner::pop_packet(PacketData& packet) {
    std::unique_lock<std::mutex> lock(queue_mutex_);
    
    queue_condition_.wait(lock, [this] { 
        return !packet_queue_.empty() || !is_processing_.load(); 
    });
    
    if (packet_queue_.empty()) {
        return false; // Stopping or no packets
    }
    
    packet = std::move(packet_queue_.front());
    packet_queue_.pop();
    return true;
}

void NetworkScanner::clear_queue() {
    std::lock_guard<std::mutex> lock(queue_mutex_);
    
    // Traiter les derniers paquets dans la queue avant de l'effacer
    while (!packet_queue_.empty()) {
        PacketData packet = std::move(packet_queue_.front());
        packet_queue_.pop();
        
        if (packet_callback_) {
            try {
                packet_callback_(packet);
            } catch (const std::exception& e) {
                std::cerr << "Error processing final packet: " << e.what() << std::endl;
            }
        }
    }
}

size_t NetworkScanner::get_queue_size() const {
    std::lock_guard<std::mutex> lock(queue_mutex_);
    return packet_queue_.size();
}

} // namespace PruftNet
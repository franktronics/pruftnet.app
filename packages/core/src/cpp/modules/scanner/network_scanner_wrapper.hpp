#pragma once

#include <napi.h>
#include "network_scanner.hpp"
#include <memory>

class NetworkScannerWrapper : public Napi::ObjectWrap<NetworkScannerWrapper> {
public:
    static Napi::Object Init(Napi::Env env, Napi::Object exports);
    static Napi::Object NewInstance(Napi::Env env, Napi::Value arg);
    
    NetworkScannerWrapper(const Napi::CallbackInfo& info);
    ~NetworkScannerWrapper();

private:
    // Méthodes exposées à JavaScript
    Napi::Value StartScan(const Napi::CallbackInfo& info);
    Napi::Value StopScan(const Napi::CallbackInfo& info);
    Napi::Value GetStats(const Napi::CallbackInfo& info);

    // Instance du scanner natif
    std::unique_ptr<PruftNet::NetworkScanner> scanner_;
    
    // Référence persistante pour la callback JavaScript
    Napi::ThreadSafeFunction tsfn_;
    
    static Napi::FunctionReference constructor;
};
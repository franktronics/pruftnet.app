#include "network_scanner_wrapper.hpp"
#include <iostream>
#include <cstring>

Napi::FunctionReference NetworkScannerWrapper::constructor;

Napi::Object NetworkScannerWrapper::Init(Napi::Env env, Napi::Object exports) {
    Napi::HandleScope scope(env);

    Napi::Function func = DefineClass(env, "NetworkScanner", {
        InstanceMethod("startScan", &NetworkScannerWrapper::StartScan),
        InstanceMethod("stopScan", &NetworkScannerWrapper::StopScan),
        InstanceMethod("getStats", &NetworkScannerWrapper::GetStats),
    });

    constructor = Napi::Persistent(func);
    constructor.SuppressDestruct();

    exports.Set("NetworkScanner", func);
    return exports;
}

Napi::Object NetworkScannerWrapper::NewInstance(Napi::Env env, Napi::Value arg) {
    Napi::EscapableHandleScope scope(env);
    Napi::Object obj = constructor.New({arg});
    return scope.Escape(napi_value(obj)).ToObject();
}

NetworkScannerWrapper::NetworkScannerWrapper(const Napi::CallbackInfo& info) 
    : Napi::ObjectWrap<NetworkScannerWrapper>(info) {
    Napi::Env env = info.Env();
    Napi::HandleScope scope(env);

    scanner_ = std::make_unique<PruftNet::NetworkScanner>();
}

NetworkScannerWrapper::~NetworkScannerWrapper() {
    if (scanner_) {
        scanner_->stop_scan();
    }
    
    // Libérer la ThreadSafeFunction si elle existe
    if (tsfn_) {
        tsfn_.Release();
    }
}

Napi::Value NetworkScannerWrapper::StartScan(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();

    if (info.Length() < 2) {
        Napi::TypeError::New(env, "Wrong number of arguments. Expected: (interface, callback)")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    if (!info[0].IsString()) {
        Napi::TypeError::New(env, "First argument must be a string (interface name)")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    if (!info[1].IsFunction()) {
        Napi::TypeError::New(env, "Second argument must be a function (callback)")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    std::string interface = info[0].As<Napi::String>().Utf8Value();
    Napi::Function callback = info[1].As<Napi::Function>();

    // Créer une ThreadSafeFunction pour appeler JavaScript depuis C++
    tsfn_ = Napi::ThreadSafeFunction::New(
        env,
        callback,  // JavaScript function appelée
        "PacketCallback", // Nom de la ressource
        0,         // Taille illimitée de la queue
        1          // Un seul thread appelant
    );

    // Créer la callback C++ qui utilise la ThreadSafeFunction
    PruftNet::PacketCallback packetCallback = [this](const PruftNet::PacketData& packet) {
        // Appeler JavaScript de manière thread-safe
        auto callback = [](Napi::Env env, Napi::Function jsCallback, PruftNet::PacketData* data) {
            // Créer l'objet JavaScript du paquet
            Napi::Object jsPacket = Napi::Object::New(env);
            
            try {
                // Convertir les données binaires en Uint8Array
                Napi::ArrayBuffer arrayBuffer = Napi::ArrayBuffer::New(env, data->length);
                std::memcpy(arrayBuffer.Data(), data->data.data(), data->length);
                Napi::Uint8Array uint8Array = Napi::Uint8Array::New(env, data->length, arrayBuffer, 0);
                
                jsPacket.Set("data", uint8Array);
                jsPacket.Set("length", Napi::Number::New(env, data->length));
                jsPacket.Set("timestamp", Napi::Number::New(env, 
                    std::chrono::duration_cast<std::chrono::milliseconds>(
                        data->timestamp.time_since_epoch()).count()));
                jsPacket.Set("source_interface", Napi::String::New(env, data->source_interface));
                
                // Appeler la fonction JavaScript
                jsCallback.Call({jsPacket});
            } catch (const std::exception& e) {
                std::cerr << "Error in JavaScript callback: " << e.what() << std::endl;
            }
            
            // Nettoyer la mémoire
            delete data;
        };

        // Copier les données du paquet pour éviter les problèmes de lifetime
        PruftNet::PacketData* packetCopy = new PruftNet::PacketData(packet);
        
        // Appeler JavaScript de manière thread-safe
        napi_status status = tsfn_.BlockingCall(packetCopy, callback);
        if (status != napi_ok) {
            std::cerr << "Error calling JavaScript callback" << std::endl;
            delete packetCopy;
        }
    };

    // Démarrer le scanner avec notre callback
    bool success = scanner_->start_scan(interface, packetCallback);
    
    return Napi::Boolean::New(env, success);
}

Napi::Value NetworkScannerWrapper::StopScan(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (scanner_) {
        scanner_->stop_scan();
    }
    
    // Libérer la ThreadSafeFunction
    if (tsfn_) {
        tsfn_.Release();
    }
    
    return env.Undefined();
}

Napi::Value NetworkScannerWrapper::GetStats(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    Napi::Object stats = Napi::Object::New(env);
    
    if (scanner_) {
        stats.Set("totalPackets", Napi::Number::New(env, scanner_->get_total_packets()));
        stats.Set("droppedPackets", Napi::Number::New(env, scanner_->get_dropped_packets()));
        stats.Set("queueSize", Napi::Number::New(env, scanner_->get_queue_size()));
    } else {
        stats.Set("totalPackets", Napi::Number::New(env, 0));
        stats.Set("droppedPackets", Napi::Number::New(env, 0));
        stats.Set("queueSize", Napi::Number::New(env, 0));
    }
    
    return stats;
}
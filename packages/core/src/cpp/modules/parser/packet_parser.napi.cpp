#include "packet_parser.napi.hpp"
#include <array>
#include <stdexcept>

Napi::FunctionReference PacketParserWrapper::constructor;

Napi::Object PacketParserWrapper::Init(Napi::Env env, Napi::Object exports) {
    Napi::HandleScope scope(env);

    Napi::Function func = DefineClass(env, "PacketParser", {
        InstanceMethod("parse", &PacketParserWrapper::Parse)
    });

    constructor = Napi::Persistent(func);
    constructor.SuppressDestruct();

    exports.Set("PacketParser", func);
    return exports;
}

PacketParserWrapper::PacketParserWrapper(const Napi::CallbackInfo& info) 
    : Napi::ObjectWrap<PacketParserWrapper>(info) {
    Napi::Env env = info.Env();
    Napi::HandleScope scope(env);

    try {
        this->parser_ = new PacketParser();
    } catch (const std::exception& e) {
        Napi::TypeError::New(env, "Failed to create PacketParser: " + std::string(e.what()))
            .ThrowAsJavaScriptException();
    }
}

Napi::Value PacketParserWrapper::Parse(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    Napi::HandleScope scope(env);

    if (info.Length() < 1) {
        Napi::TypeError::New(env, "Expected at least 1 argument (packet data)")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    if (!info[0].IsBuffer() && !info[0].IsTypedArray()) {
        Napi::TypeError::New(env, "Expected packet data to be a Buffer or TypedArray")
            .ThrowAsJavaScriptException();
        return env.Null();
    }

    try {
        uint8_t* data_ptr = nullptr;
        size_t data_length = 0;

        if (info[0].IsBuffer()) {
            Napi::Buffer<uint8_t> buffer = info[0].As<Napi::Buffer<uint8_t>>();
            data_ptr = buffer.Data();
            data_length = buffer.Length();
        } else {
            Napi::Uint8Array array = info[0].As<Napi::Uint8Array>();
            data_ptr = array.Data();
            data_length = array.ElementLength();
        }

        if (data_length == 0) {
            Napi::Error::New(env, "Packet data cannot be empty")
                .ThrowAsJavaScriptException();
            return env.Null();
        }

        if (data_length > MAX_PACKET_SIZE) {
            Napi::Error::New(env, "Packet data exceeds maximum size")
                .ThrowAsJavaScriptException();
            return env.Null();
        }

        std::array<uint8_t, MAX_PACKET_SIZE> packet_data{};
        std::memcpy(packet_data.data(), data_ptr, data_length);

        auto protocols = this->parser_->parse(packet_data);

        Napi::Array protocols_array = Napi::Array::New(env, protocols.size());
        for (size_t i = 0; i < protocols.size(); i++) {
            protocols_array[i] = ProtocolToJS(env, *protocols[i]);
        }

        Napi::Object result = Napi::Object::New(env);
        result.Set("protocols", protocols_array);

        return result;
    } catch (const std::exception& e) {
        Napi::Error::New(env, "Error parsing packet: " + std::string(e.what()))
            .ThrowAsJavaScriptException();
        return env.Null();
    }
}

Napi::Object PacketParserWrapper::ProtocolToJS(Napi::Env env, const ProtocolModel& protocol) {
    Napi::Object protocol_obj = Napi::Object::New(env);
    
    protocol_obj.Set("name", Napi::String::New(env, protocol.getName()));
    protocol_obj.Set("type", Napi::Number::New(env, static_cast<uint16_t>(protocol.getProtocolType())));
    protocol_obj.Set("headerSizeBits", Napi::Number::New(env, protocol.getHeaderSizeBits()));
    
    const auto& fields = protocol.getFields();
    Napi::Array fields_array = Napi::Array::New(env, fields.size());
    
    for (size_t i = 0; i < fields.size(); i++) {
        fields_array[i] = FieldToJS(env, fields[i]);
    }
    
    protocol_obj.Set("fields", fields_array);
    
    return protocol_obj;
}

Napi::Object PacketParserWrapper::FieldToJS(Napi::Env env, const Field& field) {
    Napi::Object field_obj = Napi::Object::New(env);
    
    field_obj.Set("bitStart", Napi::Number::New(env, field.bit_start));
    field_obj.Set("bitLength", Napi::Number::New(env, field.bit_length));
    field_obj.Set("name", Napi::String::New(env, field.name));
    field_obj.Set("description", Napi::String::New(env, field.description));
    
    Napi::Array value_array = Napi::Array::New(env, field.value.size());
    for (size_t i = 0; i < field.value.size(); i++) {
        value_array[i] = Napi::Number::New(env, field.value[i]);
    }
    field_obj.Set("value", value_array);
    field_obj.Set("valueAsString", Napi::String::New(env, field.toString()));
    
    return field_obj;
}
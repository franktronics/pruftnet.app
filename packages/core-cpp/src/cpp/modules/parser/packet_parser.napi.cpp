#include "./packet_parser.napi.hpp"
#include "../../utils/packets/packet_model.hpp"

Napi::FunctionReference PacketParserWrapper::constructor;

PacketParserWrapper::PacketParserWrapper(const Napi::CallbackInfo &info)
    : Napi::ObjectWrap<PacketParserWrapper>(info) {
  Napi::Env env = info.Env();

  if (info.Length() != 0) {
    Napi::TypeError::New(env, "PacketParser constructor takes no arguments")
        .ThrowAsJavaScriptException();
    return;
  }

  parser_ = std::make_unique<PacketParser>();
}

Napi::Object PacketParserWrapper::Init(Napi::Env env, Napi::Object exports) {
  Napi::Function func = DefineClass(
      env, "PacketParser",
      {
          InstanceMethod("parse", &PacketParserWrapper::Parse),
      });

  constructor = Napi::Persistent(func);
  constructor.SuppressDestruct();

  exports.Set("PacketParser", func);
  return exports;
}

Napi::Object PacketParserWrapper::FieldToJS(Napi::Env env, const Field &field) {
  Napi::Object obj = Napi::Object::New(env);
  
  obj.Set("bitStart", Napi::Number::New(env, field.bit_start));
  obj.Set("bitLength", Napi::Number::New(env, field.bit_length));
  obj.Set("name", Napi::String::New(env, field.name));
  obj.Set("description", Napi::String::New(env, field.description));
  
  Napi::Array valueArray = Napi::Array::New(env, field.value.size());
  for (size_t i = 0; i < field.value.size(); ++i) {
    valueArray[i] = Napi::Number::New(env, field.value[i]);
  }
  obj.Set("value", valueArray);
  
  obj.Set("valueAsString", Napi::String::New(env, field.toString()));
  
  return obj;
}

Napi::Object PacketParserWrapper::ProtocolToJS(Napi::Env env, const ProtocolModel &protocol) {
  Napi::Object obj = Napi::Object::New(env);
  
  obj.Set("name", Napi::String::New(env, protocol.getName()));
  obj.Set("type", Napi::Number::New(env, static_cast<uint16_t>(protocol.getProtocolType())));
  obj.Set("headerSizeBits", Napi::Number::New(env, protocol.getHeaderSizeBits()));
  
  const std::vector<Field> &fields = protocol.getFields();
  Napi::Array fieldsArray = Napi::Array::New(env, fields.size());
  for (size_t i = 0; i < fields.size(); ++i) {
    fieldsArray[i] = FieldToJS(env, fields[i]);
  }
  obj.Set("fields", fieldsArray);
  
  return obj;
}

Napi::Value PacketParserWrapper::Parse(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();

  if (info.Length() < 1) {
    Napi::TypeError::New(env, "Expected 1 argument: packet data buffer")
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  if (!info[0].IsBuffer()) {
    Napi::TypeError::New(env, "Argument must be a Buffer")
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  Napi::Buffer<uint8_t> buffer = info[0].As<Napi::Buffer<uint8_t>>();
  size_t length = buffer.Length();

  if (length > MAX_PACKET_SIZE) {
    Napi::TypeError::New(env, "Packet size exceeds maximum allowed size")
        .ThrowAsJavaScriptException();
    return env.Null();
  }

  std::array<uint8_t, MAX_PACKET_SIZE> data = {};
  std::memcpy(data.data(), buffer.Data(), length);

  std::vector<std::unique_ptr<ProtocolModel>> protocols = parser_->parse(data);

  Napi::Array protocolsArray = Napi::Array::New(env, protocols.size());
  for (size_t i = 0; i < protocols.size(); ++i) {
    protocolsArray[i] = ProtocolToJS(env, *protocols[i]);
  }

  Napi::Object result = Napi::Object::New(env);
  result.Set("protocols", protocolsArray);

  return result;
}

#include "packet_model.hpp"
#include <cstdio>

RawPacket::RawPacket() : timestamp(std::chrono::system_clock::now()) {}

std::string RawPacket::toString() const {
  std::string result = "────────────────────────────────────────\n";
  result += "RawPacket\n";
  result += "length=" + std::to_string(length) + ", ";
  result += "valid=" + std::string(valid ? "true" : "false") + "\n";

  // Each line contains up to 11 bytes in hexadecimal format
  const size_t bytes_per_line = 11;
  for (size_t i = 0; i < length && i < MAX_PACKET_SIZE; i += bytes_per_line) {
    for (size_t j = 0; j < bytes_per_line && (i + j) < length; ++j) {
      if (j > 0) result += " ";

      // Hexadecimal format with 2 digits and zero padding
      uint8_t byte_val = data[i + j];
      char hex_str[3];
      snprintf(hex_str, sizeof(hex_str), "%02X", byte_val);
      result += hex_str;
    }
    result += "\n";
  }

  result += "────────────────────────────────────────\n";
  return result;
}

Napi::Object RawPacket::toNapiObject(Napi::Env& env) const {
  Napi::Object obj = Napi::Object::New(env);

  if (length > 0 && length <= MAX_PACKET_SIZE) {
    Napi::ArrayBuffer buffer = Napi::ArrayBuffer::New(env, length);
    std::memcpy(buffer.Data(), data.data(), length);
    Napi::Uint8Array data_array = Napi::Uint8Array::New(env, length, buffer, 0);
    obj.Set("data", data_array);
  } else {
    Napi::Uint8Array data_array = Napi::Uint8Array::New(env, 0);
    obj.Set("data", data_array);
  }

  obj.Set("length", Napi::Number::New(env, static_cast<double>(length)));

  auto epoch = timestamp.time_since_epoch();
  auto millis = std::chrono::duration_cast<std::chrono::milliseconds>(epoch).count();
  obj.Set("timestamp", Napi::Number::New(env, static_cast<double>(millis)));

  obj.Set("valid", Napi::Boolean::New(env, valid));

  return obj;
}

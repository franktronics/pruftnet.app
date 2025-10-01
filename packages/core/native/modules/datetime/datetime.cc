#include "datetime.hpp"
#include <chrono>
#include <ctime>
#include <iomanip>
#include <sstream>

namespace DateTime {

static Napi::Value GetDateTimeInfo(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  using namespace std::chrono;
  const auto now = system_clock::now();
  const auto epochMs = duration_cast<milliseconds>(now.time_since_epoch()).count();

  std::time_t t = system_clock::to_time_t(now);
  std::tm localTm{};
#if defined(_WIN32)
  localtime_s(&localTm, &t);
#else
  localtime_r(&t, &localTm);
#endif

  char isoBuf[64];
  std::strftime(isoBuf, sizeof(isoBuf), "%Y-%m-%dT%H:%M:%S%z", &localTm);

  char tzBuf[32];
  std::strftime(tzBuf, sizeof(tzBuf), "%Z", &localTm);

  Napi::Object obj = Napi::Object::New(env);
  obj.Set("iso", Napi::String::New(env, isoBuf));
  obj.Set("epochMs", Napi::Number::New(env, static_cast<double>(epochMs)));
  obj.Set("timezone", Napi::String::New(env, tzBuf));
  return obj;
}

Napi::Object Init(Napi::Env env) {
  Napi::Object ns = Napi::Object::New(env);
  ns.Set("getDateTimeInfo", Napi::Function::New(env, GetDateTimeInfo, "getDateTimeInfo"));
  return ns;
}

} // namespace DateTime


#include <cassert>
#include <cstdint>
#include <sstream>
#include <string>

#include "tools/capture_worker_protocol.hpp"

namespace {

using namespace pruftnet::capture_worker::protocol;

void json_fields_are_bounded_and_unambiguous() {
  const std::string control{"line\n\t\x01", 7};
  assert(json_string(control) == "\"line\\n\\t\"");

  constexpr std::string_view request =
      R"({"v":2,"id":"request-1","count":42,"enabled":true})";
  assert(field(request, "id") == "request-1");
  assert(number(request, "count") == 42);
  assert(boolean_field(request, "enabled") == true);
  assert(!number(request, "id"));
  assert(!field(R"({"id":"first","id":"second"})", "id"));
  assert(!field(R"({"id":"\u0061"})", "id"));
}

void framing_round_trips_and_classifies_truncation() {
  std::ostringstream output(std::ios::binary);
  write_frame(output, "payload");
  std::istringstream input(output.str(), std::ios::binary);
  std::string payload;
  assert(read_frame(input, payload) == FrameRead::Ok);
  assert(payload == "payload");
  assert(read_frame(input, payload) == FrameRead::End);

  std::istringstream short_header(std::string{"\x04\x00", 2}, std::ios::binary);
  assert(read_frame(short_header, payload) == FrameRead::Truncated);

  std::string short_body{"\x04\x00\x00\x00", 4};
  short_body += "abc";
  std::istringstream truncated(short_body, std::ios::binary);
  assert(read_frame(truncated, payload) == FrameRead::Truncated);
}

void oversized_frames_are_drained_before_the_next_request() {
  const auto oversized = kMaxRequestBytes + 1;
  std::string input_bytes(4 + oversized, 'x');
  input_bytes[0] = static_cast<char>(oversized & 0xffU);
  input_bytes[1] = static_cast<char>((oversized >> 8U) & 0xffU);
  input_bytes[2] = static_cast<char>((oversized >> 16U) & 0xffU);
  input_bytes[3] = static_cast<char>((oversized >> 24U) & 0xffU);
  std::ostringstream next(std::ios::binary);
  write_frame(next, "next");
  input_bytes += next.str();

  std::istringstream input(input_bytes, std::ios::binary);
  std::string payload;
  assert(read_frame(input, payload) == FrameRead::TooLarge);
  assert(read_frame(input, payload) == FrameRead::Ok);
  assert(payload == "next");
}

} // namespace

int main() {
  json_fields_are_bounded_and_unambiguous();
  framing_round_trips_and_classifies_truncation();
  oversized_frames_are_drained_before_the_next_request();
}

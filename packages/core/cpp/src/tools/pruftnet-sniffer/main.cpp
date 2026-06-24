#include <atomic>
#include <cctype>
#include <chrono>
#include <csignal>
#include <cstddef>
#include <cstdint>
#include <exception>
#include <iostream>
#include <optional>
#include <string>
#include <string_view>
#include <thread>
#include <variant>

#include "pruftnet/capture/capture_engine.hpp"
#include "pruftnet/capture/pcap_device.hpp"
#include "pruftnet/capture/pcap_linktype.hpp"
#include "pruftnet/capture/raw_packet_printer.hpp"

namespace {

std::atomic<bool> g_stop_requested{false};

void handle_signal(int) {
  g_stop_requested.store(true, std::memory_order_release);
}

std::string to_lower(std::string value) {
  for (auto &character : value) {
    character =
        static_cast<char>(std::tolower(static_cast<unsigned char>(character)));
  }
  return value;
}

std::uint64_t parse_u64(const std::string &value, const char *name) {
  std::size_t consumed = 0;
  const auto parsed = std::stoull(value, &consumed, 10);
  if (consumed != value.size()) {
    throw std::invalid_argument(std::string("Invalid numeric value for ") +
                                name + ": " + value);
  }
  return parsed;
}

std::uint64_t parse_size_bytes(std::string value, const char *name) {
  value = to_lower(std::move(value));

  std::uint64_t multiplier = 1;
  auto strip_suffix = [&](std::string_view suffix,
                          std::uint64_t suffix_multiplier) {
    if (value.ends_with(suffix)) {
      value.resize(value.size() - suffix.size());
      multiplier = suffix_multiplier;
      return true;
    }
    return false;
  };

  strip_suffix("mib", 1024ULL * 1024ULL) ||
      strip_suffix("mb", 1000ULL * 1000ULL) || strip_suffix("kib", 1024ULL) ||
      strip_suffix("kb", 1000ULL) || strip_suffix("b", 1ULL);

  return parse_u64(value, name) * multiplier;
}

void print_usage(std::ostream &output) {
  output
      << "Usage:\n"
      << "  pruftnet-sniffer --list-devices\n"
      << "  pruftnet-sniffer --interface <name> [options]\n\n"
      << "Options:\n"
      << "  -i, --interface <name>           Capture interface name\n"
      << "  --list-devices                   List libpcap/Npcap devices\n"
      << "  --promisc                        Enable promiscuous mode\n"
      << "  --no-promisc                     Disable promiscuous mode\n"
      << "  --snaplen <bytes>                Bytes captured per packet, "
         "default 512\n"
      << "  --buffer-size <bytes|64MiB>      pcap kernel buffer, default "
         "64MiB\n"
      << "  --timeout-ms <ms>                pcap read timeout, default 10\n"
      << "  --immediate                      Enable immediate mode when "
         "supported\n"
      << "  --monitor-mode                   Request RF monitor mode\n"
      << "  --ring-slots <count>             Application ring slots, default "
         "65536\n"
      << "  --dispatch-batch <count>         pcap_dispatch packet batch, "
         "default 64\n"
      << "  --bpf <expression>               BPF filter\n"
      << "  --accept-linktype <name|number>  Accepted DLT, repeatable\n"
      << "  --unsupported-linktype <fail|raw> Behavior for unsupported DLT, "
         "default fail\n"
      << "  --direction <in|out|inout>       Capture direction when supported\n"
      << "  --print-mode <none|summary|hex>  Parser stub output, default "
         "summary\n"
      << "  --print-every <count>            Print one packet every N packets\n"
      << "  --print-bytes <count>            Hex bytes to print, default 64\n"
      << "  --max-packets <count>            Stop after N packets\n"
      << "  --stats-interval-ms <ms>         pcap stats polling interval\n"
      << "  -h, --help                       Show this help\n";
}

void print_error(const pruftnet::capture::CaptureError &error) {
  std::cerr << '[' << pruftnet::capture::to_string(error.severity) << "] "
            << pruftnet::capture::to_string(error.code) << ": "
            << error.message;
  if (!error.pcap_error.empty()) {
    std::cerr << " pcap=\"" << error.pcap_error << '"';
  }
  std::cerr << '\n';
}

void print_event(const pruftnet::capture::CaptureEvent &event) {
  std::cerr << '[' << pruftnet::capture::to_string(event.severity) << "] "
            << pruftnet::capture::to_string(event.code) << ": "
            << event.message;
  if (!event.pcap_error.empty()) {
    std::cerr << " pcap=\"" << event.pcap_error << '"';
  }
  std::cerr << '\n';
}

void print_stats(const pruftnet::capture::CaptureStatsSnapshot &stats) {
  std::cerr << "stats packets_seen=" << stats.packets_seen
            << " enqueued=" << stats.packets_enqueued
            << " parsed=" << stats.packets_parsed
            << " app_ring_drops=" << stats.app_ring_drops
            << " pcap_recv=" << stats.pcap_recv
            << " pcap_drop=" << stats.pcap_drop
            << " pcap_ifdrop=" << stats.pcap_ifdrop
            << " ring_depth=" << stats.ring_depth << '/' << stats.ring_capacity
            << " max_ring_depth=" << stats.max_ring_depth << '\n';
}

int list_devices() {
  auto result = pruftnet::capture::list_pcap_devices();
  if (std::holds_alternative<pruftnet::capture::CaptureError>(result)) {
    print_error(std::get<pruftnet::capture::CaptureError>(result));
    return 1;
  }

  const auto &devices =
      std::get<std::vector<pruftnet::capture::PcapDevice>>(result);
  for (const auto &device : devices) {
    std::cout << device.name;
    if (!device.description.empty()) {
      std::cout << " - " << device.description;
    }

    std::cout << " [";
    bool wrote_flag = false;
    auto flag = [&](std::string_view name, bool enabled) {
      if (!enabled) {
        return;
      }
      if (wrote_flag) {
        std::cout << ',';
      }
      std::cout << name;
      wrote_flag = true;
    };
    flag("loopback", device.loopback);
    flag("up", device.up);
    flag("running", device.running);
    flag("wireless", device.wireless);
    std::cout << "]\n";
  }

  return 0;
}

} // namespace

int main(int argc, char **argv) {
  using namespace pruftnet::capture;

  CaptureConfig config;
  config.accepted_link_types = default_accepted_link_types();

  RawPacketPrinterConfig printer_config;
  printer_config.mode = RawPacketPrintMode::Summary;
  printer_config.bytes_to_print = 64;
  printer_config.print_every = 1;
  printer_config.output = &std::cout;

  bool should_list_devices = false;
  bool custom_link_types = false;

  try {
    for (int index = 1; index < argc; ++index) {
      const std::string arg = argv[index];
      auto require_value = [&](const char *option) -> std::string {
        if (index + 1 >= argc) {
          throw std::invalid_argument(std::string("Missing value for ") +
                                      option);
        }
        return argv[++index];
      };

      if (arg == "-h" || arg == "--help") {
        print_usage(std::cout);
        return 0;
      }
      if (arg == "--list-devices") {
        should_list_devices = true;
        continue;
      }
      if (arg == "-i" || arg == "--interface") {
        config.interface_name = require_value(arg.c_str());
        continue;
      }
      if (arg == "--promisc") {
        config.promiscuous = true;
        continue;
      }
      if (arg == "--no-promisc") {
        config.promiscuous = false;
        continue;
      }
      if (arg == "--snaplen") {
        config.snaplen = static_cast<int>(
            parse_size_bytes(require_value(arg.c_str()), arg.c_str()));
        continue;
      }
      if (arg == "--buffer-size") {
        config.pcap_buffer_size_bytes = static_cast<int>(
            parse_size_bytes(require_value(arg.c_str()), arg.c_str()));
        continue;
      }
      if (arg == "--timeout-ms") {
        config.read_timeout_ms = static_cast<int>(
            parse_u64(require_value(arg.c_str()), arg.c_str()));
        continue;
      }
      if (arg == "--immediate") {
        config.immediate_mode = true;
        continue;
      }
      if (arg == "--monitor-mode") {
        config.monitor_mode = true;
        continue;
      }
      if (arg == "--ring-slots") {
        config.ring_slots = static_cast<std::size_t>(
            parse_u64(require_value(arg.c_str()), arg.c_str()));
        continue;
      }
      if (arg == "--dispatch-batch") {
        config.dispatch_batch_size = static_cast<int>(
            parse_u64(require_value(arg.c_str()), arg.c_str()));
        continue;
      }
      if (arg == "--bpf" || arg == "--filter") {
        config.bpf_filter = require_value(arg.c_str());
        continue;
      }
      if (arg == "--accept-linktype") {
        if (!custom_link_types) {
          config.accepted_link_types.clear();
          custom_link_types = true;
        }

        const auto value = require_value(arg.c_str());
        const auto link_type = link_type_value_by_name(value);
        if (!link_type.has_value()) {
          throw std::invalid_argument("Unknown link type: " + value);
        }
        config.accepted_link_types.push_back(*link_type);
        continue;
      }
      if (arg == "--unsupported-linktype") {
        const auto value = to_lower(require_value(arg.c_str()));
        if (value == "fail") {
          config.unsupported_link_type_policy = UnsupportedLinkTypePolicy::Fail;
        } else if (value == "raw") {
          config.unsupported_link_type_policy =
              UnsupportedLinkTypePolicy::CaptureRaw;
        } else {
          throw std::invalid_argument(
              "Unsupported value for --unsupported-linktype: " + value);
        }
        continue;
      }
      if (arg == "--direction") {
        const auto value = to_lower(require_value(arg.c_str()));
        if (value == "in") {
          config.direction = CaptureDirection::InOnly;
        } else if (value == "out") {
          config.direction = CaptureDirection::OutOnly;
        } else if (value == "inout") {
          config.direction = CaptureDirection::InOut;
        } else {
          throw std::invalid_argument("Unsupported value for --direction: " +
                                      value);
        }
        continue;
      }
      if (arg == "--print-mode") {
        const auto value = to_lower(require_value(arg.c_str()));
        if (value == "none") {
          printer_config.mode = RawPacketPrintMode::None;
        } else if (value == "summary") {
          printer_config.mode = RawPacketPrintMode::Summary;
        } else if (value == "hex") {
          printer_config.mode = RawPacketPrintMode::Hex;
        } else {
          throw std::invalid_argument("Unsupported value for --print-mode: " +
                                      value);
        }
        continue;
      }
      if (arg == "--print-every") {
        printer_config.print_every =
            parse_u64(require_value(arg.c_str()), arg.c_str());
        continue;
      }
      if (arg == "--print-bytes") {
        printer_config.bytes_to_print = static_cast<std::size_t>(
            parse_u64(require_value(arg.c_str()), arg.c_str()));
        continue;
      }
      if (arg == "--max-packets") {
        config.max_packets = parse_u64(require_value(arg.c_str()), arg.c_str());
        continue;
      }
      if (arg == "--stats-interval-ms") {
        config.stats_interval = std::chrono::milliseconds(
            parse_u64(require_value(arg.c_str()), arg.c_str()));
        continue;
      }

      throw std::invalid_argument("Unknown argument: " + arg);
    }
  } catch (const std::exception &error) {
    std::cerr << "Argument error: " << error.what() << "\n\n";
    print_usage(std::cerr);
    return 2;
  }

  if (should_list_devices) {
    return list_devices();
  }

  if (config.interface_name.empty()) {
    std::cerr << "Argument error: --interface is required unless "
                 "--list-devices is used.\n\n";
    print_usage(std::cerr);
    return 2;
  }

  std::signal(SIGINT, handle_signal);
#ifdef SIGTERM
  std::signal(SIGTERM, handle_signal);
#endif

  RawPacketPrinter printer(printer_config);
  std::atomic<bool> had_error{false};
  CaptureEngine engine(config, printer, [&](const CaptureEvent &event) {
    print_event(event);
    if (event.severity == CaptureSeverity::Error ||
        event.severity == CaptureSeverity::Fatal) {
      had_error.store(true, std::memory_order_release);
    }
  });

  if (auto error = engine.start()) {
    print_error(*error);
    return 1;
  }

  while (!g_stop_requested.load(std::memory_order_acquire) &&
         engine.is_running()) {
    std::this_thread::sleep_for(std::chrono::milliseconds(250));
  }

  if (g_stop_requested.load(std::memory_order_acquire)) {
    engine.stop();
  } else {
    engine.wait();
  }

  print_stats(engine.stats());
  return had_error.load(std::memory_order_acquire) ? 1 : 0;

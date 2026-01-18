#include "packet_parser.hpp"
#include <exprtk.hpp>
#include <filesystem>
#include <iostream>
#include <regex>
#include <sstream>
#include <stdexcept>

namespace fs = std::filesystem;

void PacketParser::setProtocolEntryFile(const std::string& path) {
  protocol_entry_file_ = path;
}

uint64_t PacketParser::extractBits(const uint8_t* data, size_t data_length, uint32_t bit_offset,
                                   uint32_t bit_length) const {
  if (bit_length == 0 || bit_length > 64) {
    return 0;
  }

  uint64_t result = 0;
  uint32_t bits_remaining = bit_length;
  uint32_t current_bit = bit_offset;

  while (bits_remaining > 0) {
    uint32_t byte_index = current_bit / 8;
    uint32_t bit_in_byte = current_bit % 8;

    if (byte_index >= data_length) {
      break;
    }

    uint32_t bits_available = 8 - bit_in_byte;
    uint32_t bits_to_read = std::min(bits_available, bits_remaining);

    uint8_t mask = ((1 << bits_to_read) - 1) << (bits_available - bits_to_read);
    uint8_t extracted = (data[byte_index] & mask) >> (bits_available - bits_to_read);

    result = (result << bits_to_read) | extracted;

    current_bit += bits_to_read;
    bits_remaining -= bits_to_read;
  }

  return result;
}

uint32_t PacketParser::evaluateStartAfter(const std::string& expression,
                                          const std::unordered_map<std::string, uint64_t>& field_values) const {
  if (expression.empty()) {
    return 0;
  }

  if (expression.find("calculate:") == 0) {
    if (expression.length() <= 10) {
      return 0;
    }
    std::string expr_str = expression.substr(10);

    while (!expr_str.empty() && expr_str[0] == ' ') {
      expr_str.erase(0, 1);
    }

    std::regex field_regex(R"(\[(\d+_\d+)\])");
    std::string processed_expr = expr_str;
    std::smatch match;

    while (std::regex_search(processed_expr, match, field_regex)) {
      std::string field_key = match[1].str();
      auto it = field_values.find(field_key);
      if (it != field_values.end()) {
        processed_expr = match.prefix().str() + std::to_string(it->second) + match.suffix().str();
      } else {
        processed_expr = match.prefix().str() + "0" + match.suffix().str();
      }
    }

    exprtk::expression<double> expr;
    exprtk::parser<double> parser;

    if (parser.compile(processed_expr, expr)) {
      return static_cast<uint32_t>(expr.value());
    }

    return 0;
  }

  try {
    return static_cast<uint32_t>(std::stoul(expression));
  } catch (...) {
    return 0;
  }
}

std::string PacketParser::resolveProtocolPath(const std::string& current_path, const std::string& relative_path) const {
  fs::path current(current_path);
  fs::path parent = current.parent_path();
  fs::path resolved = parent / relative_path;
  return resolved.lexically_normal().string();
}

ParsedPacket PacketParser::parsePacket(const RawPacket& raw_packet) {
  ParsedPacket result;

  if (!raw_packet.valid || raw_packet.length == 0) {
    return result;
  }

  std::string current_protocol_path = protocol_entry_file_;
  uint32_t current_bit_offset = 0;

  while (!current_protocol_path.empty()) {
    ProtocolConfig config;
    try {
      config = protocol_loader_.loadProtocol(current_protocol_path);
    } catch (const std::exception& e) {
      std::cerr << "Failed to load protocol from " << current_protocol_path << ": " << e.what() << std::endl;
      break;
    }

    ParsedProtocolLayer layer;
    layer.file = current_protocol_path;
    std::unordered_map<std::string, uint64_t> field_values;

    for (const auto& [offset_length, field] : config.header) {
      uint32_t field_offset = offset_length[0] + current_bit_offset;
      uint32_t field_length = offset_length[1];

      uint64_t value = extractBits(raw_packet.data.data(), raw_packet.length, field_offset, field_length);

      std::string relative_key = std::to_string(offset_length[0]) + "_" + std::to_string(offset_length[1]);
      std::string absolute_key = relative_key + "_" + std::to_string(field_offset);
      layer.fields[absolute_key] = value;
      field_values[relative_key] = value;
    }

    result.layers.push_back(layer);

    if (!config.next_protocol.has_value()) {
      break;
    }

    const NextProtocol& next = config.next_protocol.value();

    size_t underscore_pos = next.selector.find('_');
    if (underscore_pos == std::string::npos || underscore_pos == 0 || underscore_pos >= next.selector.length() - 1) {
      break;
    }

    uint32_t selector_offset = 0;
    uint32_t selector_length = 0;
    try {
      selector_offset = std::stoul(next.selector.substr(0, underscore_pos));
      selector_length = std::stoul(next.selector.substr(underscore_pos + 1));
    } catch (const std::exception& e) {
      std::cerr << "Invalid selector format: " << next.selector << " - " << e.what() << std::endl;
      break;
    }

    uint64_t selector_value =
        extractBits(raw_packet.data.data(), raw_packet.length, current_bit_offset + selector_offset, selector_length);

    auto mapping_it = next.mappings.find(static_cast<uint16_t>(selector_value));
    if (mapping_it == next.mappings.end()) {
      break;
    }

    uint32_t start_after = evaluateStartAfter(next.start_after, field_values);
    current_bit_offset += start_after;

    current_protocol_path = resolveProtocolPath(current_protocol_path, mapping_it->second);
  }
  return result;
}

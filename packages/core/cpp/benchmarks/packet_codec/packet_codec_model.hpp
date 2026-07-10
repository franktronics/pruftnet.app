#pragma once

#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

namespace pruftnet::benchmarks::packet_codec {

enum class ValueTag : std::uint8_t {
    None = 0,
    Unsigned = 1,
    Address = 2,
    Bytes = 3,
};

enum class DataSourceKind : std::uint8_t {
    Captured = 0,
    Reassembled = 1,
};

struct ColumnValue {
    std::uint32_t field_id = 0;
    ValueTag value_tag = ValueTag::None;
    std::uint8_t flags = 0;
    std::uint64_t value_low = 0;
    std::uint64_t value_high = 0;
};

struct PacketSummary {
    std::uint64_t packet_id = 0;
    std::uint64_t timestamp_ns = 0;
    std::uint32_t interface_id = 0;
    std::uint32_t captured_length = 0;
    std::uint32_t wire_length = 0;
    std::uint32_t flags = 0;
    std::uint8_t parse_condition = 0;
    std::vector<std::uint32_t> protocol_ids;
    std::vector<ColumnValue> columns;
};

struct SummaryBatch {
    std::uint64_t capture_id_high = 0;
    std::uint64_t capture_id_low = 0;
    std::uint32_t registry_generation = 0;
    std::vector<PacketSummary> packets;
};

struct FieldNode {
    std::uint64_t value_low = 0;
    std::uint64_t value_high = 0;
    std::uint32_t field_id = 0;
    std::uint32_t parent_index = 0;
    std::uint32_t data_source_id = 0;
    std::uint32_t offset = 0;
    std::uint32_t length = 0;
    std::uint32_t flags = 0;
    ValueTag value_tag = ValueTag::None;
};

struct Contributor {
    std::uint64_t packet_id = 0;
    std::uint32_t source_offset = 0;
    std::uint32_t length = 0;
    std::uint32_t destination_offset = 0;
};

struct DataSource {
    std::uint32_t id = 0;
    DataSourceKind kind = DataSourceKind::Captured;
    std::string name;
    std::vector<std::byte> bytes;
    std::vector<Contributor> contributors;
};

struct SelectedPacketView {
    std::uint64_t capture_id_high = 0;
    std::uint64_t capture_id_low = 0;
    std::uint64_t packet_id = 0;
    std::uint64_t timestamp_ns = 0;
    std::uint32_t registry_generation = 0;
    std::uint32_t interface_id = 0;
    std::uint32_t captured_length = 0;
    std::uint32_t wire_length = 0;
    std::uint32_t flags = 0;
    std::vector<FieldNode> nodes;
    std::vector<DataSource> data_sources;
};

SummaryBatch make_summary_batch(std::size_t packet_count);
SelectedPacketView make_selected_packet_view(std::size_t node_count);

} // namespace pruftnet::benchmarks::packet_codec

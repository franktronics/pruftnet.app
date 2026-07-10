#include "benchmarks/packet_codec/flatbuffers_packet_codec.hpp"

#include <cstdlib>
#include <stdexcept>

#include "flatbuffers/flatbuffers.h"
#include "flatbuffers/verifier.h"
#include "packet_codec_generated.h"

namespace pruftnet::benchmarks::packet_codec {

namespace {

thread_local std::size_t allocation_count = 0;

class CountingAllocator final : public flatbuffers::Allocator {
public:
    std::uint8_t* allocate(std::size_t size) override {
        ++allocation_count;
        return static_cast<std::uint8_t*>(std::malloc(size));
    }

    void deallocate(std::uint8_t* pointer, std::size_t) override { std::free(pointer); }
};

template <typename Buffer> std::vector<std::byte> copy_buffer(const Buffer& builder) {
    const auto* begin = reinterpret_cast<const std::byte*>(builder.GetBufferPointer());
    return {begin, begin + builder.GetSize()};
}

flatbuffers::FlatBufferBuilder make_builder(CountingAllocator& allocator) {
    allocation_count = 0;
    return flatbuffers::FlatBufferBuilder(1'024, &allocator, false);
}

Pruftnet::Benchmark::ValueTag to_flatbuffers(ValueTag tag) { return static_cast<Pruftnet::Benchmark::ValueTag>(tag); }

Pruftnet::Benchmark::DataSourceKind to_flatbuffers(DataSourceKind kind) {
    return static_cast<Pruftnet::Benchmark::DataSourceKind>(kind);
}

} // namespace

std::vector<std::byte> encode_flatbuffers(const SummaryBatch& batch) {
    CountingAllocator allocator;
    auto builder = make_builder(allocator);
    std::vector<Pruftnet::Benchmark::SummaryRecord> packet_records;
    std::vector<std::uint32_t> protocol_ids;
    std::vector<Pruftnet::Benchmark::ColumnValue> columns;
    packet_records.reserve(batch.packets.size());
    std::size_t protocol_count = 0;
    std::size_t column_count = 0;
    for (const auto& packet : batch.packets) {
        protocol_count += packet.protocol_ids.size();
        column_count += packet.columns.size();
    }
    protocol_ids.reserve(protocol_count);
    columns.reserve(column_count);

    for (const auto& packet : batch.packets) {
        const auto protocol_offset = static_cast<std::uint32_t>(protocol_ids.size());
        const auto column_offset = static_cast<std::uint32_t>(columns.size());
        protocol_ids.insert(protocol_ids.end(), packet.protocol_ids.begin(), packet.protocol_ids.end());
        for (const auto& column : packet.columns) {
            columns.emplace_back(column.field_id, to_flatbuffers(column.value_tag), column.flags, 0, column.value_low,
                                 column.value_high);
        }
        packet_records.emplace_back(packet.packet_id, packet.timestamp_ns, packet.interface_id, packet.captured_length,
                                    packet.wire_length, packet.flags, protocol_offset, column_offset,
                                    static_cast<std::uint16_t>(packet.protocol_ids.size()),
                                    static_cast<std::uint16_t>(packet.columns.size()), packet.parse_condition, 0, 0);
    }

    const auto packet_vector = builder.CreateVectorOfStructs(packet_records);
    const auto protocol_vector = builder.CreateVector(protocol_ids);
    const auto column_vector = builder.CreateVectorOfStructs(columns);
    const auto summary = Pruftnet::Benchmark::CreateSummaryBatch(builder, batch.capture_id_high, batch.capture_id_low,
                                                                 batch.registry_generation, packet_vector,
                                                                 protocol_vector, column_vector);
    const auto envelope =
        Pruftnet::Benchmark::CreateBenchmarkEnvelope(builder, 1, Pruftnet::Benchmark::MessageKind_Summary, summary, {});
    Pruftnet::Benchmark::FinishBenchmarkEnvelopeBuffer(builder, envelope);
    return copy_buffer(builder);
}

std::vector<std::byte> encode_flatbuffers(const SelectedPacketView& detail) {
    CountingAllocator allocator;
    auto builder = make_builder(allocator);
    std::vector<Pruftnet::Benchmark::FieldNode> nodes;
    std::vector<Pruftnet::Benchmark::DataSourceRecord> sources;
    std::vector<Pruftnet::Benchmark::Contributor> contributors;
    std::vector<std::uint8_t> name_bytes;
    std::vector<std::uint8_t> data_bytes;
    nodes.reserve(detail.nodes.size());
    sources.reserve(detail.data_sources.size());
    std::size_t contributor_count = 0;
    std::size_t name_byte_count = 0;
    std::size_t data_byte_count = 0;
    for (const auto& source : detail.data_sources) {
        contributor_count += source.contributors.size();
        name_byte_count += source.name.size();
        data_byte_count += source.bytes.size();
    }
    contributors.reserve(contributor_count);
    name_bytes.reserve(name_byte_count);
    data_bytes.reserve(data_byte_count);

    for (const auto& node : detail.nodes) {
        nodes.emplace_back(node.value_low, node.value_high, node.field_id, node.parent_index, node.data_source_id,
                           node.offset, node.length, node.flags, to_flatbuffers(node.value_tag), 0, 0, 0);
    }

    for (const auto& source : detail.data_sources) {
        const auto name_offset = static_cast<std::uint32_t>(name_bytes.size());
        const auto data_offset = static_cast<std::uint32_t>(data_bytes.size());
        const auto contributor_offset = static_cast<std::uint32_t>(contributors.size());
        name_bytes.insert(name_bytes.end(), source.name.begin(), source.name.end());
        for (const auto value : source.bytes) {
            data_bytes.push_back(std::to_integer<std::uint8_t>(value));
        }
        for (const auto& contributor : source.contributors) {
            contributors.emplace_back(contributor.packet_id, contributor.source_offset, contributor.length,
                                      contributor.destination_offset, 0);
        }
        sources.emplace_back(source.id, name_offset, static_cast<std::uint32_t>(source.name.size()), data_offset,
                             static_cast<std::uint32_t>(source.bytes.size()), contributor_offset,
                             static_cast<std::uint32_t>(source.contributors.size()), to_flatbuffers(source.kind), 0, 0);
    }

    const auto node_vector = builder.CreateVectorOfStructs(nodes);
    const auto source_vector = builder.CreateVectorOfStructs(sources);
    const auto contributor_vector = builder.CreateVectorOfStructs(contributors);
    const auto name_vector = builder.CreateVector(name_bytes);
    const auto data_vector = builder.CreateVector(data_bytes);
    const auto packet_detail = Pruftnet::Benchmark::CreateSelectedPacketView(
        builder, detail.capture_id_high, detail.capture_id_low, detail.packet_id, detail.timestamp_ns,
        detail.registry_generation, detail.interface_id, detail.captured_length, detail.wire_length, detail.flags,
        node_vector, source_vector, contributor_vector, name_vector, data_vector);
    const auto envelope = Pruftnet::Benchmark::CreateBenchmarkEnvelope(
        builder, 1, Pruftnet::Benchmark::MessageKind_Detail, {}, packet_detail);
    Pruftnet::Benchmark::FinishBenchmarkEnvelopeBuffer(builder, envelope);
    return copy_buffer(builder);
}

bool verify_flatbuffers(std::span<const std::byte> bytes) noexcept {
    flatbuffers::Verifier verifier(reinterpret_cast<const std::uint8_t*>(bytes.data()), bytes.size(), 16, 100'000);
    return Pruftnet::Benchmark::VerifyBenchmarkEnvelopeBuffer(verifier);
}

std::uint64_t traverse_flatbuffers(std::span<const std::byte> bytes) {
    if (!verify_flatbuffers(bytes)) {
        throw std::runtime_error("invalid FlatBuffers packet codec buffer");
    }
    const auto* envelope = Pruftnet::Benchmark::GetBenchmarkEnvelope(bytes.data());
    std::uint64_t checksum = 0;
    if (envelope->kind() == Pruftnet::Benchmark::MessageKind_Summary) {
        const auto* summary = envelope->summary();
        checksum = summary->capture_id_high() ^ summary->capture_id_low();
        for (const auto* packet : *summary->packets()) {
            checksum += packet->packet_id();
            checksum += packet->timestamp_ns();
            checksum += packet->interface_id();
            checksum += packet->captured_length();
            checksum += packet->wire_length();
            checksum += packet->protocol_offset();
            checksum += packet->column_offset();
        }
        for (const auto protocol_id : *summary->protocol_ids()) {
            checksum += protocol_id;
        }
        for (const auto* column : *summary->columns()) {
            checksum += column->field_id();
            checksum += column->value_low();
            checksum += column->value_high();
        }
        return checksum;
    }

    const auto* detail = envelope->detail();
    checksum = detail->packet_id() + detail->timestamp_ns();
    for (const auto* node : *detail->nodes()) {
        checksum += node->value_low();
        checksum += node->value_high();
        checksum += node->field_id();
        checksum += node->data_source_id();
        checksum += node->offset();
    }
    for (const auto* source : *detail->data_sources()) {
        checksum += source->id();
        checksum += source->name_offset();
        checksum += source->data_offset();
        checksum += source->data_length();
    }
    for (const auto* contributor : *detail->contributors()) {
        checksum += contributor->packet_id();
        checksum += contributor->source_offset();
        checksum += contributor->destination_offset();
    }
    for (const auto value : *detail->name_bytes()) {
        checksum += value;
    }
    for (const auto value : *detail->data_bytes()) {
        checksum += value;
    }
    return checksum;
}

std::size_t last_flatbuffers_allocation_count() noexcept { return allocation_count; }

} // namespace pruftnet::benchmarks::packet_codec

#include "benchmarks/packet_codec/packet_codec_model.hpp"

#include <algorithm>

namespace pruftnet::benchmarks::packet_codec {

namespace {

std::vector<std::byte> patterned_bytes(std::size_t size, std::uint8_t seed) {
    std::vector<std::byte> bytes(size);
    for (std::size_t index = 0; index < size; ++index) {
        bytes[index] = static_cast<std::byte>(static_cast<std::uint8_t>(seed + index * 17U));
    }
    return bytes;
}

} // namespace

SummaryBatch make_summary_batch(std::size_t packet_count) {
    SummaryBatch batch;
    batch.capture_id_high = 0x0123456789ABCDEFULL;
    batch.capture_id_low = 0xFEDCBA9876543210ULL;
    batch.registry_generation = 7;
    batch.packets.reserve(packet_count);

    for (std::size_t index = 0; index < packet_count; ++index) {
        PacketSummary packet;
        packet.packet_id = static_cast<std::uint64_t>(index * 2U + 1U);
        packet.timestamp_ns = 1'720'000'000'000'000'000ULL + static_cast<std::uint64_t>(index) * 1'000ULL;
        packet.interface_id = static_cast<std::uint32_t>(index % 4U + 1U);
        packet.captured_length = static_cast<std::uint32_t>(64U + index % 1'437U);
        packet.wire_length = packet.captured_length + static_cast<std::uint32_t>(index % 3U == 0U ? 16U : 0U);
        packet.flags = index % 17U == 0U ? 1U : 0U;
        packet.parse_condition = static_cast<std::uint8_t>(index % 97U == 0U ? 1U : 0U);

        const auto protocol_count = static_cast<std::size_t>(3U + index % 4U);
        packet.protocol_ids.reserve(protocol_count);
        for (std::size_t protocol_index = 0; protocol_index < protocol_count; ++protocol_index) {
            packet.protocol_ids.push_back(static_cast<std::uint32_t>(1U + protocol_index + index % 11U));
        }

        packet.columns.reserve(4);
        packet.columns.push_back(ColumnValue{
            .field_id = 100,
            .value_tag = ValueTag::Address,
            .value_low = 0x0A000001ULL + index,
        });
        packet.columns.push_back(ColumnValue{
            .field_id = 101,
            .value_tag = ValueTag::Address,
            .value_low = 0xC0A80001ULL + index,
        });
        packet.columns.push_back(ColumnValue{
            .field_id = 200,
            .value_tag = ValueTag::Unsigned,
            .value_low = 1'024U + index % 50'000U,
        });
        packet.columns.push_back(ColumnValue{
            .field_id = 201,
            .value_tag = ValueTag::Unsigned,
            .value_low = index % 2U == 0U ? 443U : 53U,
        });
        batch.packets.push_back(std::move(packet));
    }

    return batch;
}

SelectedPacketView make_selected_packet_view(std::size_t node_count) {
    SelectedPacketView detail;
    detail.capture_id_high = 0x0123456789ABCDEFULL;
    detail.capture_id_low = 0xFEDCBA9876543210ULL;
    detail.packet_id = 4'097;
    detail.timestamp_ns = 1'720'000'000'123'456'789ULL;
    detail.registry_generation = 7;
    detail.interface_id = 2;
    detail.captured_length = 512;
    detail.wire_length = 1'514;
    detail.flags = 1;
    detail.nodes.reserve(node_count);

    for (std::size_t index = 0; index < node_count; ++index) {
        const bool generated = index % 19U == 0U;
        detail.nodes.push_back(FieldNode{
            .value_low = static_cast<std::uint64_t>(index * 31U + 7U),
            .value_high = static_cast<std::uint64_t>(index % 13U),
            .field_id = static_cast<std::uint32_t>(1U + index % 127U),
            .parent_index = static_cast<std::uint32_t>(index == 0U ? 0U : (index - 1U) / 3U),
            .data_source_id = static_cast<std::uint32_t>(generated          ? 0U
                                                         : index % 5U == 0U ? 1U
                                                                            : 0U),
            .offset = static_cast<std::uint32_t>(generated ? 0U : index * 7U % 480U),
            .length = static_cast<std::uint32_t>(generated ? 0U : 1U + index % 16U),
            .flags = generated ? 1U : 0U,
            .value_tag = index % 7U == 0U ? ValueTag::Bytes : ValueTag::Unsigned,
        });
    }

    DataSource captured;
    captured.id = 0;
    captured.kind = DataSourceKind::Captured;
    captured.name = "Frame";
    captured.bytes = patterned_bytes(detail.captured_length, 11);
    detail.data_sources.push_back(std::move(captured));

    DataSource reassembled;
    reassembled.id = 1;
    reassembled.kind = DataSourceKind::Reassembled;
    reassembled.name = "Reassembled TCP";
    reassembled.bytes = patterned_bytes(std::max<std::size_t>(768U, node_count * 8U), 29);
    const auto contributor_count = std::min<std::size_t>(16U, std::max<std::size_t>(2U, node_count / 32U));
    reassembled.contributors.reserve(contributor_count);
    for (std::size_t index = 0; index < contributor_count; ++index) {
        reassembled.contributors.push_back(Contributor{
            .packet_id = static_cast<std::uint64_t>(4'000U + index * 3U),
            .source_offset = static_cast<std::uint32_t>(index * 13U),
            .length = 64,
            .destination_offset = static_cast<std::uint32_t>(index * 64U),
        });
    }
    detail.data_sources.push_back(std::move(reassembled));

    return detail;
}

} // namespace pruftnet::benchmarks::packet_codec

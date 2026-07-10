#include "benchmarks/packet_codec/custom_packet_codec.hpp"

#include <algorithm>
#include <array>
#include <limits>
#include <stdexcept>
#include <string_view>
#include <type_traits>

namespace pruftnet::benchmarks::packet_codec {

namespace {

constexpr std::array<std::byte, 4> kSummaryMagic{std::byte{'P'}, std::byte{'S'}, std::byte{'U'}, std::byte{'M'}};
constexpr std::array<std::byte, 4> kDetailMagic{std::byte{'P'}, std::byte{'D'}, std::byte{'E'}, std::byte{'T'}};
constexpr std::uint16_t kFormatVersion = 1;
constexpr std::uint16_t kSummaryKind = 1;
constexpr std::uint16_t kDetailKind = 2;
constexpr std::size_t kSummaryHeaderSize = 64;
constexpr std::size_t kSummaryRecordSize = 48;
constexpr std::size_t kColumnRecordSize = 24;
constexpr std::size_t kDetailHeaderSize = 120;
constexpr std::size_t kFieldNodeSize = 48;
constexpr std::size_t kDataSourceRecordSize = 32;
constexpr std::size_t kContributorRecordSize = 24;

template <typename T> void write_le(std::vector<std::byte>& output, std::size_t offset, T value) {
    static_assert(std::is_unsigned_v<T>);
    for (std::size_t index = 0; index < sizeof(T); ++index) {
        output[offset + index] = static_cast<std::byte>(value & static_cast<T>(0xFFU));
        value >>= 8U;
    }
}

template <typename T> T read_le(std::span<const std::byte> bytes, std::size_t offset) noexcept {
    static_assert(std::is_unsigned_v<T>);
    T value = 0;
    for (std::size_t index = 0; index < sizeof(T); ++index) {
        value |= static_cast<T>(std::to_integer<std::uint8_t>(bytes[offset + index])) << (index * 8U);
    }
    return value;
}

std::uint32_t checked_u32(std::size_t value, std::string_view label) {
    if (value > std::numeric_limits<std::uint32_t>::max()) {
        throw std::length_error(std::string(label) + " exceeds the benchmark format limit");
    }
    return static_cast<std::uint32_t>(value);
}

std::size_t checked_add(std::size_t left, std::size_t right) {
    if (right > std::numeric_limits<std::size_t>::max() - left) {
        throw std::length_error("benchmark buffer size overflow");
    }
    return left + right;
}

std::size_t checked_multiply(std::size_t left, std::size_t right) {
    if (left != 0U && right > std::numeric_limits<std::size_t>::max() / left) {
        throw std::length_error("benchmark buffer size overflow");
    }
    return left * right;
}

bool has_magic(std::span<const std::byte> bytes, const std::array<std::byte, 4>& magic) noexcept {
    return bytes.size() >= magic.size() && std::equal(magic.begin(), magic.end(), bytes.begin());
}

bool valid_section(std::size_t total_size, std::uint32_t offset, std::uint32_t count, std::uint32_t stride) noexcept {
    const auto section_size = static_cast<std::uint64_t>(count) * stride;
    return offset <= total_size && section_size <= total_size - offset;
}

std::uint64_t traverse_summary(std::span<const std::byte> bytes) {
    const auto packet_count = read_le<std::uint32_t>(bytes, 32);
    const auto protocol_count = read_le<std::uint32_t>(bytes, 36);
    const auto column_count = read_le<std::uint32_t>(bytes, 40);
    const auto packets_offset = read_le<std::uint32_t>(bytes, 44);
    const auto protocols_offset = read_le<std::uint32_t>(bytes, 48);
    const auto columns_offset = read_le<std::uint32_t>(bytes, 52);
    std::uint64_t checksum = read_le<std::uint64_t>(bytes, 16) ^ read_le<std::uint64_t>(bytes, 24);

    for (std::uint32_t index = 0; index < packet_count; ++index) {
        const auto offset = packets_offset + static_cast<std::size_t>(index) * kSummaryRecordSize;
        checksum += read_le<std::uint64_t>(bytes, offset);
        checksum += read_le<std::uint64_t>(bytes, offset + 8);
        checksum += read_le<std::uint32_t>(bytes, offset + 16);
        checksum += read_le<std::uint32_t>(bytes, offset + 20);
        checksum += read_le<std::uint32_t>(bytes, offset + 24);
        checksum += read_le<std::uint32_t>(bytes, offset + 32);
        checksum += read_le<std::uint32_t>(bytes, offset + 36);
    }
    for (std::uint32_t index = 0; index < protocol_count; ++index) {
        checksum += read_le<std::uint32_t>(bytes, protocols_offset + static_cast<std::size_t>(index) * 4U);
    }
    for (std::uint32_t index = 0; index < column_count; ++index) {
        const auto offset = columns_offset + static_cast<std::size_t>(index) * kColumnRecordSize;
        checksum += read_le<std::uint32_t>(bytes, offset);
        checksum += read_le<std::uint64_t>(bytes, offset + 8);
        checksum += read_le<std::uint64_t>(bytes, offset + 16);
    }
    return checksum;
}

std::uint64_t traverse_detail(std::span<const std::byte> bytes) {
    const auto node_count = read_le<std::uint32_t>(bytes, 64);
    const auto source_count = read_le<std::uint32_t>(bytes, 68);
    const auto contributor_count = read_le<std::uint32_t>(bytes, 72);
    const auto name_size = read_le<std::uint32_t>(bytes, 76);
    const auto data_size = read_le<std::uint32_t>(bytes, 80);
    const auto nodes_offset = read_le<std::uint32_t>(bytes, 84);
    const auto sources_offset = read_le<std::uint32_t>(bytes, 88);
    const auto contributors_offset = read_le<std::uint32_t>(bytes, 92);
    const auto names_offset = read_le<std::uint32_t>(bytes, 96);
    const auto data_offset = read_le<std::uint32_t>(bytes, 100);
    std::uint64_t checksum = read_le<std::uint64_t>(bytes, 32) + read_le<std::uint64_t>(bytes, 40);

    for (std::uint32_t index = 0; index < node_count; ++index) {
        const auto offset = nodes_offset + static_cast<std::size_t>(index) * kFieldNodeSize;
        checksum += read_le<std::uint64_t>(bytes, offset);
        checksum += read_le<std::uint64_t>(bytes, offset + 8);
        checksum += read_le<std::uint32_t>(bytes, offset + 16);
        checksum += read_le<std::uint32_t>(bytes, offset + 24);
        checksum += read_le<std::uint32_t>(bytes, offset + 28);
    }
    for (std::uint32_t index = 0; index < source_count; ++index) {
        const auto offset = sources_offset + static_cast<std::size_t>(index) * kDataSourceRecordSize;
        checksum += read_le<std::uint32_t>(bytes, offset);
        checksum += read_le<std::uint32_t>(bytes, offset + 4);
        checksum += read_le<std::uint32_t>(bytes, offset + 12);
        checksum += read_le<std::uint32_t>(bytes, offset + 16);
    }
    for (std::uint32_t index = 0; index < contributor_count; ++index) {
        const auto offset = contributors_offset + static_cast<std::size_t>(index) * kContributorRecordSize;
        checksum += read_le<std::uint64_t>(bytes, offset);
        checksum += read_le<std::uint32_t>(bytes, offset + 8);
        checksum += read_le<std::uint32_t>(bytes, offset + 16);
    }
    for (std::uint32_t index = 0; index < name_size; ++index) {
        checksum += std::to_integer<std::uint8_t>(bytes[names_offset + index]);
    }
    for (std::uint32_t index = 0; index < data_size; ++index) {
        checksum += std::to_integer<std::uint8_t>(bytes[data_offset + index]);
    }
    return checksum;
}

} // namespace

std::vector<std::byte> encode_custom(const SummaryBatch& batch) {
    std::size_t protocol_count = 0;
    std::size_t column_count = 0;
    for (const auto& packet : batch.packets) {
        protocol_count = checked_add(protocol_count, packet.protocol_ids.size());
        column_count = checked_add(column_count, packet.columns.size());
    }

    const auto packets_offset = kSummaryHeaderSize;
    const auto protocols_offset =
        checked_add(packets_offset, checked_multiply(batch.packets.size(), kSummaryRecordSize));
    const auto columns_offset = checked_add(protocols_offset, checked_multiply(protocol_count, sizeof(std::uint32_t)));
    const auto total_size = checked_add(columns_offset, checked_multiply(column_count, kColumnRecordSize));
    std::vector<std::byte> output(total_size);
    std::copy(kSummaryMagic.begin(), kSummaryMagic.end(), output.begin());
    write_le(output, 4, kFormatVersion);
    write_le(output, 6, kSummaryKind);
    write_le(output, 8, checked_u32(total_size, "summary size"));
    write_le(output, 12, batch.registry_generation);
    write_le(output, 16, batch.capture_id_high);
    write_le(output, 24, batch.capture_id_low);
    write_le(output, 32, checked_u32(batch.packets.size(), "packet count"));
    write_le(output, 36, checked_u32(protocol_count, "protocol count"));
    write_le(output, 40, checked_u32(column_count, "column count"));
    write_le(output, 44, checked_u32(packets_offset, "packet offset"));
    write_le(output, 48, checked_u32(protocols_offset, "protocol offset"));
    write_le(output, 52, checked_u32(columns_offset, "column offset"));
    write_le(output, 56, static_cast<std::uint32_t>(kSummaryRecordSize));
    write_le(output, 60, static_cast<std::uint32_t>(kColumnRecordSize));

    std::size_t protocol_index = 0;
    std::size_t column_index = 0;
    for (std::size_t packet_index = 0; packet_index < batch.packets.size(); ++packet_index) {
        const auto& packet = batch.packets[packet_index];
        const auto offset = packets_offset + packet_index * kSummaryRecordSize;
        write_le(output, offset, packet.packet_id);
        write_le(output, offset + 8, packet.timestamp_ns);
        write_le(output, offset + 16, packet.interface_id);
        write_le(output, offset + 20, packet.captured_length);
        write_le(output, offset + 24, packet.wire_length);
        write_le(output, offset + 28, packet.flags);
        write_le(output, offset + 32, checked_u32(protocol_index, "protocol index"));
        write_le(output, offset + 36, checked_u32(column_index, "column index"));
        write_le(output, offset + 40, static_cast<std::uint16_t>(packet.protocol_ids.size()));
        write_le(output, offset + 42, static_cast<std::uint16_t>(packet.columns.size()));
        output[offset + 44] = static_cast<std::byte>(packet.parse_condition);

        for (const auto protocol_id : packet.protocol_ids) {
            write_le(output, protocols_offset + protocol_index * 4U, protocol_id);
            ++protocol_index;
        }
        for (const auto& column : packet.columns) {
            const auto column_offset = columns_offset + column_index * kColumnRecordSize;
            write_le(output, column_offset, column.field_id);
            output[column_offset + 4] = static_cast<std::byte>(column.value_tag);
            output[column_offset + 5] = static_cast<std::byte>(column.flags);
            write_le(output, column_offset + 8, column.value_low);
            write_le(output, column_offset + 16, column.value_high);
            ++column_index;
        }
    }
    return output;
}

std::vector<std::byte> encode_custom(const SelectedPacketView& detail) {
    std::size_t contributor_count = 0;
    std::size_t name_size = 0;
    std::size_t data_size = 0;
    for (const auto& source : detail.data_sources) {
        contributor_count = checked_add(contributor_count, source.contributors.size());
        name_size = checked_add(name_size, source.name.size());
        data_size = checked_add(data_size, source.bytes.size());
    }

    const auto nodes_offset = kDetailHeaderSize;
    const auto sources_offset = checked_add(nodes_offset, checked_multiply(detail.nodes.size(), kFieldNodeSize));
    const auto contributors_offset =
        checked_add(sources_offset, checked_multiply(detail.data_sources.size(), kDataSourceRecordSize));
    const auto names_offset =
        checked_add(contributors_offset, checked_multiply(contributor_count, kContributorRecordSize));
    const auto data_offset = checked_add(names_offset, name_size);
    const auto total_size = checked_add(data_offset, data_size);
    std::vector<std::byte> output(total_size);
    std::copy(kDetailMagic.begin(), kDetailMagic.end(), output.begin());
    write_le(output, 4, kFormatVersion);
    write_le(output, 6, kDetailKind);
    write_le(output, 8, checked_u32(total_size, "detail size"));
    write_le(output, 12, detail.registry_generation);
    write_le(output, 16, detail.capture_id_high);
    write_le(output, 24, detail.capture_id_low);
    write_le(output, 32, detail.packet_id);
    write_le(output, 40, detail.timestamp_ns);
    write_le(output, 48, detail.interface_id);
    write_le(output, 52, detail.captured_length);
    write_le(output, 56, detail.wire_length);
    write_le(output, 60, detail.flags);
    write_le(output, 64, checked_u32(detail.nodes.size(), "node count"));
    write_le(output, 68, checked_u32(detail.data_sources.size(), "data source count"));
    write_le(output, 72, checked_u32(contributor_count, "contributor count"));
    write_le(output, 76, checked_u32(name_size, "name bytes"));
    write_le(output, 80, checked_u32(data_size, "data bytes"));
    write_le(output, 84, checked_u32(nodes_offset, "node offset"));
    write_le(output, 88, checked_u32(sources_offset, "source offset"));
    write_le(output, 92, checked_u32(contributors_offset, "contributor offset"));
    write_le(output, 96, checked_u32(names_offset, "name offset"));
    write_le(output, 100, checked_u32(data_offset, "data offset"));
    write_le(output, 104, static_cast<std::uint32_t>(kFieldNodeSize));
    write_le(output, 108, static_cast<std::uint32_t>(kDataSourceRecordSize));
    write_le(output, 112, static_cast<std::uint32_t>(kContributorRecordSize));

    for (std::size_t index = 0; index < detail.nodes.size(); ++index) {
        const auto& node = detail.nodes[index];
        const auto offset = nodes_offset + index * kFieldNodeSize;
        write_le(output, offset, node.value_low);
        write_le(output, offset + 8, node.value_high);
        write_le(output, offset + 16, node.field_id);
        write_le(output, offset + 20, node.parent_index);
        write_le(output, offset + 24, node.data_source_id);
        write_le(output, offset + 28, node.offset);
        write_le(output, offset + 32, node.length);
        write_le(output, offset + 36, node.flags);
        output[offset + 40] = static_cast<std::byte>(node.value_tag);
    }

    std::size_t contributor_index = 0;
    std::size_t name_index = 0;
    std::size_t data_index = 0;
    for (std::size_t source_index = 0; source_index < detail.data_sources.size(); ++source_index) {
        const auto& source = detail.data_sources[source_index];
        const auto offset = sources_offset + source_index * kDataSourceRecordSize;
        write_le(output, offset, source.id);
        write_le(output, offset + 4, checked_u32(name_index, "source name index"));
        write_le(output, offset + 8, checked_u32(source.name.size(), "source name length"));
        write_le(output, offset + 12, checked_u32(data_index, "source data index"));
        write_le(output, offset + 16, checked_u32(source.bytes.size(), "source data length"));
        write_le(output, offset + 20, checked_u32(contributor_index, "contributor index"));
        write_le(output, offset + 24, checked_u32(source.contributors.size(), "source contributor count"));
        output[offset + 28] = static_cast<std::byte>(source.kind);

        for (const auto& contributor : source.contributors) {
            const auto contributor_offset = contributors_offset + contributor_index * kContributorRecordSize;
            write_le(output, contributor_offset, contributor.packet_id);
            write_le(output, contributor_offset + 8, contributor.source_offset);
            write_le(output, contributor_offset + 12, contributor.length);
            write_le(output, contributor_offset + 16, contributor.destination_offset);
            ++contributor_index;
        }

        std::transform(source.name.begin(), source.name.end(), output.begin() + names_offset + name_index,
                       [](char value) { return static_cast<std::byte>(static_cast<unsigned char>(value)); });
        std::copy(source.bytes.begin(), source.bytes.end(), output.begin() + data_offset + data_index);
        name_index += source.name.size();
        data_index += source.bytes.size();
    }
    return output;
}

bool verify_custom(std::span<const std::byte> bytes) noexcept {
    if (bytes.size() < 12U || read_le<std::uint16_t>(bytes, 4) != kFormatVersion) {
        return false;
    }
    const auto total_size = read_le<std::uint32_t>(bytes, 8);
    if (total_size != bytes.size()) {
        return false;
    }

    if (has_magic(bytes, kSummaryMagic)) {
        if (bytes.size() < kSummaryHeaderSize || read_le<std::uint16_t>(bytes, 6) != kSummaryKind) {
            return false;
        }
        return read_le<std::uint32_t>(bytes, 56) == kSummaryRecordSize &&
               read_le<std::uint32_t>(bytes, 60) == kColumnRecordSize &&
               valid_section(total_size, read_le<std::uint32_t>(bytes, 44), read_le<std::uint32_t>(bytes, 32),
                             kSummaryRecordSize) &&
               valid_section(total_size, read_le<std::uint32_t>(bytes, 48), read_le<std::uint32_t>(bytes, 36), 4) &&
               valid_section(total_size, read_le<std::uint32_t>(bytes, 52), read_le<std::uint32_t>(bytes, 40),
                             kColumnRecordSize);
    }
    if (has_magic(bytes, kDetailMagic)) {
        if (bytes.size() < kDetailHeaderSize || read_le<std::uint16_t>(bytes, 6) != kDetailKind) {
            return false;
        }
        return read_le<std::uint32_t>(bytes, 104) == kFieldNodeSize &&
               read_le<std::uint32_t>(bytes, 108) == kDataSourceRecordSize &&
               read_le<std::uint32_t>(bytes, 112) == kContributorRecordSize &&
               valid_section(total_size, read_le<std::uint32_t>(bytes, 84), read_le<std::uint32_t>(bytes, 64),
                             kFieldNodeSize) &&
               valid_section(total_size, read_le<std::uint32_t>(bytes, 88), read_le<std::uint32_t>(bytes, 68),
                             kDataSourceRecordSize) &&
               valid_section(total_size, read_le<std::uint32_t>(bytes, 92), read_le<std::uint32_t>(bytes, 72),
                             kContributorRecordSize) &&
               valid_section(total_size, read_le<std::uint32_t>(bytes, 96), read_le<std::uint32_t>(bytes, 76), 1) &&
               valid_section(total_size, read_le<std::uint32_t>(bytes, 100), read_le<std::uint32_t>(bytes, 80), 1);
    }
    return false;
}

std::uint64_t traverse_custom(std::span<const std::byte> bytes) {
    if (!verify_custom(bytes)) {
        throw std::runtime_error("invalid custom packet codec buffer");
    }
    return has_magic(bytes, kSummaryMagic) ? traverse_summary(bytes) : traverse_detail(bytes);
}

} // namespace pruftnet::benchmarks::packet_codec

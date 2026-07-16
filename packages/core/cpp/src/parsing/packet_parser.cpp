#include "parsing/packet_parser.hpp"

#include <algorithm>
#include <stdexcept>
#include <string_view>
#include <utility>

#include "parsing/dissector_context.hpp"
#include "pruftnet/parsing/packet_view.hpp"

namespace pruftnet::parsing::internal {
namespace {

constexpr std::string_view kCapturedSourceName = "Captured frame";

} // namespace

PacketParser::PacketParser(RegistrySnapshotPtr registry, ParseBudget budget,
                           ReassemblyBudget reassembly_budget)
    : PacketParser(make_core_dissector_catalog(std::move(registry)), budget,
                   reassembly_budget) {}

PacketParser::PacketParser(DissectorCatalogPtr catalog, ParseBudget budget,
                           ReassemblyBudget reassembly_budget)
    : catalog_(std::move(catalog)), budget_(budget),
      reassembly_(reassembly_budget) {
  if (!catalog_) {
    throw std::invalid_argument("PacketParser requires a dissector catalog.");
  }
  constexpr auto structural_bytes =
      kParsedTreeEncodedOverhead + sizeof(ParsedDataSource) +
      kCapturedSourceName.size() + sizeof(ParsedFieldNode);
  if (budget_.max_data_sources < 1 || budget_.max_nodes < 1 ||
      budget_.max_depth < 1 ||
      budget_.max_string_bytes < kCapturedSourceName.size() ||
      budget_.max_encoded_bytes < structural_bytes) {
    throw std::invalid_argument(
        "PacketParser budget cannot hold the mandatory source and root node.");
  }
}

ParsedPacketTree PacketParser::parse(const sniffing::RawPacketView &packet) {
  if (packet.metadata.key.capture_id.is_nil() ||
      packet.metadata.key.packet_id == 0) {
    throw std::invalid_argument("PacketParser requires a valid packet key.");
  }
  const auto declared_captured =
      static_cast<std::size_t>(packet.metadata.captured_len);
  constexpr auto structural_bytes =
      kParsedTreeEncodedOverhead + sizeof(ParsedDataSource) +
      kCapturedSourceName.size() + sizeof(ParsedFieldNode);
  const auto encoded_source_limit =
      budget_.max_encoded_bytes - structural_bytes;
  const auto source_limit =
      std::min(budget_.max_source_bytes, encoded_source_limit);
  const auto unbounded_captured_length =
      std::min(packet.bytes.size(), declared_captured);
  const auto captured_length =
      std::min(unbounded_captured_length, source_limit);
  const bool resource_clipped = captured_length < unbounded_captured_length;
  const auto captured = packet.bytes.first(captured_length);
  auto storage =
      has_recycled_tree_ ? std::move(recycled_tree_) : ParsedPacketTree{};
  has_recycled_tree_ = false;
  reassembly_.begin_packet(packet.metadata);
  DissectorContext context(*catalog_, packet, budget_, std::move(storage),
                           reassembly_);
  const auto source = context.add_source(captured);
  if (!source) {
    throw std::runtime_error(
        "PacketParser budget cannot hold the captured data source.");
  }
  const auto root_view =
      PacketView::from_capture(captured, packet.metadata.wire_len, *source);
  const auto root =
      context.add_protocol(catalog_->common().root_frame, kNoParentIndex,
                           root_view, root_view.captured_length());
  if (!root) {
    throw std::runtime_error("PacketParser budget cannot hold the root node.");
  }
  if (resource_clipped) {
    context.mark_resource_limit();
    return context.finalize();
  }
  (void)context.dispatch_root(root_view, *root);
  return context.finalize();
}

void PacketParser::recycle(ParsedPacketTree tree) noexcept {
  recycled_tree_ = std::move(tree);
  has_recycled_tree_ = true;
}

} // namespace pruftnet::parsing::internal

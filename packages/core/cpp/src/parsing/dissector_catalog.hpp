#pragma once

#include <array>
#include <cstdint>
#include <memory>
#include <utility>
#include <vector>

#include "parsing/dissector.hpp"
#include "parsing/dissectors/dissector_states.hpp"
#include "pruftnet/parsing/registry.hpp"

namespace pruftnet::parsing::internal {

class DissectorCatalog {
public:
    explicit DissectorCatalog(RegistrySnapshotPtr registry);

    DissectorCatalog(const DissectorCatalog&) = delete;
    DissectorCatalog& operator=(const DissectorCatalog&) = delete;

    [[nodiscard]] const RegistrySnapshotPtr& registry() const noexcept;
    [[nodiscard]] const CommonDissectorState& common() const noexcept;
    [[nodiscard]] DissectorHandle root() const noexcept;
    [[nodiscard]] DissectorHandle dlt(std::uint32_t value) const noexcept;
    [[nodiscard]] DissectorHandle ethertype(std::uint16_t value) const noexcept;
    [[nodiscard]] DissectorHandle ipv4_protocol(std::uint8_t value) const noexcept;

private:
    [[nodiscard]] std::uint16_t add_handle(DissectorFunction function, std::shared_ptr<const void> state);
    void bind_dlt(std::uint32_t selector, std::uint16_t handle);
    void bind_ethertype(std::uint16_t selector, std::uint16_t handle);
    void bind_ipv4_protocol(std::uint8_t selector, std::uint16_t handle);
    [[nodiscard]] DissectorHandle handle(std::uint16_t index) const noexcept;

    RegistrySnapshotPtr registry_;
    std::shared_ptr<const CommonDissectorState> common_;
    std::vector<std::shared_ptr<const void>> states_;
    std::vector<DissectorHandle> handles_;
    std::uint16_t root_ = 0;
    std::vector<std::pair<std::uint32_t, std::uint16_t>> dlt_;
    std::array<std::uint16_t, 65'536> ethertype_{};
    std::array<std::uint16_t, 256> ipv4_protocol_{};
};

using DissectorCatalogPtr = std::shared_ptr<const DissectorCatalog>;

[[nodiscard]] DissectorCatalogPtr make_core_dissector_catalog(RegistrySnapshotPtr registry);

} // namespace pruftnet::parsing::internal

#include <cassert>
#include <memory>
#include <stdexcept>
#include <variant>

#include "parsing/dissector_catalog.hpp"
#include "pruftnet/parsing/registry.hpp"

namespace {

using namespace pruftnet::parsing;
using namespace pruftnet::parsing::internal;

RegistrySnapshotPtr core_registry() {
    auto result = make_core_registry();
    assert(std::holds_alternative<RegistrySnapshot>(result));
    return std::make_shared<const RegistrySnapshot>(std::move(std::get<RegistrySnapshot>(result)));
}

void core_catalog_has_typed_dispatch_paths() {
    const auto catalog = make_core_dissector_catalog(core_registry());
    assert(catalog->root());
    assert(catalog->dlt(1));
    assert(!catalog->dlt(147));
    assert(catalog->ethertype(0x0800));
    assert(catalog->ethertype(0x8100));
    assert(catalog->ethertype(0x88a8));
    assert(!catalog->ethertype(0x86dd));
    assert(catalog->ipv4_protocol(6));
    assert(catalog->ipv4_protocol(17));
    assert(!catalog->ipv4_protocol(1));
}

void catalog_rejects_incompatible_registries_before_capture() {
    RegistryBuilder builder;
    const auto protocol = builder.register_protocol("root", "Root");
    assert(std::holds_alternative<ProtocolId>(protocol));
    assert(std::holds_alternative<FieldId>(builder.register_field(std::get<ProtocolId>(protocol), "root.frame",
                                                                 "Frame", FieldValueType::Protocol)));
    auto snapshot = builder.freeze();
    assert(std::holds_alternative<RegistrySnapshot>(snapshot));
    bool rejected = false;
    try {
        (void)make_core_dissector_catalog(
            std::make_shared<const RegistrySnapshot>(std::move(std::get<RegistrySnapshot>(snapshot))));
    } catch (const std::logic_error&) {
        rejected = true;
    }
    assert(rejected);
}

} // namespace

int main() {
    core_catalog_has_typed_dispatch_paths();
    catalog_rejects_incompatible_registries_before_capture();
}

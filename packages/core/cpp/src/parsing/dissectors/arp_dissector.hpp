#pragma once

#include "parsing/dissector.hpp"

namespace pruftnet::parsing::internal {
DissectionResult dissect_arp(DissectorContext&, const void*, const PacketView&, std::uint32_t);
}

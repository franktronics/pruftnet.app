cmake_minimum_required(VERSION 3.24)

project(PruftnetSniffing VERSION 0.1.0 LANGUAGES CXX)

option(PRUFTNET_SNIFFING_BUILD_TESTS "Build C++ sniffing tests" ON)
option(PRUFTNET_SNIFFING_BUILD_BENCHMARKS "Build C++ sniffing benchmarks" OFF)
option(PRUFTNET_SNIFFING_BUILD_FUZZERS "Build C++ sniffing fuzz harnesses" OFF)
option(PRUFTNET_SNIFFING_USE_LIBFUZZER "Build fuzz harnesses for libFuzzer instead of standalone execution" OFF)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

function(pruftnet_enable_warnings target)
    if(MSVC)
        target_compile_options(${target} PRIVATE /W4)
    else()
        target_compile_options(${target} PRIVATE -Wall -Wextra -Wpedantic)
    endif()
endfunction()

list(APPEND CMAKE_MODULE_PATH "${CMAKE_CURRENT_SOURCE_DIR}/cmake")

find_package(PCAP REQUIRED)

include(CheckSymbolExists)

set(CMAKE_REQUIRED_INCLUDES ${PCAP_INCLUDE_DIRS})
set(CMAKE_REQUIRED_LIBRARIES ${PCAP_LIBRARIES})

check_symbol_exists(pcap_set_tstamp_precision "pcap/pcap.h" PRUFTNET_HAVE_PCAP_SET_TSTAMP_PRECISION)
check_symbol_exists(pcap_set_tstamp_type "pcap/pcap.h" PRUFTNET_HAVE_PCAP_SET_TSTAMP_TYPE)
check_symbol_exists(pcap_tstamp_type_name_to_val "pcap/pcap.h" PRUFTNET_HAVE_PCAP_TSTAMP_TYPE_NAME_TO_VAL)
check_symbol_exists(pcap_set_rfmon "pcap/pcap.h" PRUFTNET_HAVE_PCAP_SET_RFMON)
check_symbol_exists(pcap_can_set_rfmon "pcap/pcap.h" PRUFTNET_HAVE_PCAP_CAN_SET_RFMON)
check_symbol_exists(pcap_set_datalink "pcap/pcap.h" PRUFTNET_HAVE_PCAP_SET_DATALINK)
check_symbol_exists(pcap_list_datalinks "pcap/pcap.h" PRUFTNET_HAVE_PCAP_LIST_DATALINKS)
check_symbol_exists(pcap_free_datalinks "pcap/pcap.h" PRUFTNET_HAVE_PCAP_FREE_DATALINKS)
check_symbol_exists(pcap_list_tstamp_types "pcap/pcap.h" PRUFTNET_HAVE_PCAP_LIST_TSTAMP_TYPES)
check_symbol_exists(pcap_free_tstamp_types "pcap/pcap.h" PRUFTNET_HAVE_PCAP_FREE_TSTAMP_TYPES)
check_symbol_exists(pcap_statustostr "pcap/pcap.h" PRUFTNET_HAVE_PCAP_STATUSTOSTR)
check_symbol_exists(pcap_datalink_val_to_name "pcap/pcap.h" PRUFTNET_HAVE_PCAP_DATALINK_NAME)
check_symbol_exists(pcap_datalink_val_to_description "pcap/pcap.h" PRUFTNET_HAVE_PCAP_DATALINK_DESCRIPTION)
check_symbol_exists(pcap_tstamp_type_val_to_name "pcap/pcap.h" PRUFTNET_HAVE_PCAP_TSTAMP_TYPE_VAL_TO_NAME)
check_symbol_exists(pcap_tstamp_type_val_to_description "pcap/pcap.h" PRUFTNET_HAVE_PCAP_TSTAMP_TYPE_VAL_TO_DESCRIPTION)

include(FetchContent)

set(FLATBUFFERS_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(FLATBUFFERS_BUILD_FLATLIB OFF CACHE BOOL "" FORCE)
set(FLATBUFFERS_BUILD_GRPCTEST OFF CACHE BOOL "" FORCE)
set(FLATBUFFERS_BUILD_SHAREDLIB OFF CACHE BOOL "" FORCE)
set(FLATBUFFERS_INSTALL OFF CACHE BOOL "" FORCE)
FetchContent_Declare(
    flatbuffers
    GIT_REPOSITORY https://github.com/google/flatbuffers.git
    GIT_TAG v25.9.23
    GIT_SHALLOW TRUE
)
FetchContent_MakeAvailable(flatbuffers)

set(PRUFTNET_HOST_FLATC "" CACHE FILEPATH "Host flatc executable used when cross-compiling")
if(PRUFTNET_HOST_FLATC)
    execute_process(
        COMMAND "${PRUFTNET_HOST_FLATC}" --version
        RESULT_VARIABLE PRUFTNET_HOST_FLATC_STATUS
        OUTPUT_VARIABLE PRUFTNET_HOST_FLATC_VERSION
        ERROR_VARIABLE PRUFTNET_HOST_FLATC_ERROR
        OUTPUT_STRIP_TRAILING_WHITESPACE
    )
    if(NOT PRUFTNET_HOST_FLATC_STATUS EQUAL 0 OR
       NOT PRUFTNET_HOST_FLATC_VERSION MATCHES "^flatc version 25\\.9\\.23$")
        message(FATAL_ERROR
            "PRUFTNET_HOST_FLATC must be FlatBuffers 25.9.23; got '${PRUFTNET_HOST_FLATC_VERSION}${PRUFTNET_HOST_FLATC_ERROR}'")
    endif()
    set(PRUFTNET_FLATC_COMMAND "${PRUFTNET_HOST_FLATC}")
    set(PRUFTNET_FLATC_DEPENDS "${PRUFTNET_HOST_FLATC}")
elseif(CMAKE_CROSSCOMPILING)
    message(FATAL_ERROR "Cross-compiling requires PRUFTNET_HOST_FLATC to reference a host FlatBuffers 25.9.23 compiler")
else()
    set(PRUFTNET_FLATC_COMMAND "$<TARGET_FILE:flatc>")
    set(PRUFTNET_FLATC_DEPENDS flatc)
endif()

set(PACKET_TREE_GENERATED_DIR "${CMAKE_CURRENT_BINARY_DIR}/generated/packet_tree")
set(PACKET_TREE_GENERATED_HEADER "${PACKET_TREE_GENERATED_DIR}/packet_tree_generated.h")
add_custom_command(
    OUTPUT "${PACKET_TREE_GENERATED_HEADER}"
    COMMAND "${CMAKE_COMMAND}" -E make_directory "${PACKET_TREE_GENERATED_DIR}"
    COMMAND "${PRUFTNET_FLATC_COMMAND}" --cpp -o "${PACKET_TREE_GENERATED_DIR}"
            "${CMAKE_CURRENT_SOURCE_DIR}/schemas/packet_tree.fbs"
    DEPENDS
        ${PRUFTNET_FLATC_DEPENDS}
        "${CMAKE_CURRENT_SOURCE_DIR}/schemas/packet_tree.fbs"
    VERBATIM
)

add_custom_target(packet_tree_ts_codegen
    COMMAND "${CMAKE_COMMAND}" -E remove_directory
            "${CMAKE_CURRENT_SOURCE_DIR}/../../packet-codec/src/generated"
    COMMAND "${CMAKE_COMMAND}" -E make_directory
            "${CMAKE_CURRENT_SOURCE_DIR}/../../packet-codec/src/generated"
    COMMAND "${PRUFTNET_FLATC_COMMAND}" --ts --ts-flat-files
            -o "${CMAKE_CURRENT_SOURCE_DIR}/../../packet-codec/src/generated"
            "${CMAKE_CURRENT_SOURCE_DIR}/schemas/packet_tree.fbs"
    DEPENDS
        ${PRUFTNET_FLATC_DEPENDS}
        "${CMAKE_CURRENT_SOURCE_DIR}/schemas/packet_tree.fbs"
    VERBATIM
)

add_library(pruftnet_sniffing STATIC
    src/capture/pcapng_format.cpp
    src/capture/pcapng_spool.cpp
    src/parsing/catalog/catalog_registrar.cpp
    src/parsing/catalog/core_catalog.cpp
    src/parsing/catalog/link_catalog.cpp
    src/parsing/catalog/network_catalog.cpp
    src/parsing/core_link_types.cpp
    src/parsing/dissector_catalog.cpp
    src/parsing/dissector_context.cpp
    src/parsing/dissectors/application/dhcp_dissector.cpp
    src/parsing/dissectors/application/dhcpv6_dissector.cpp
    src/parsing/dissectors/application/dns_dissector.cpp
    src/parsing/dissectors/application/http_dissector.cpp
    src/parsing/dissectors/application/ntp_dissector.cpp
    src/parsing/dissectors/application/quic_dissector.cpp
    src/parsing/dissectors/application/tls_dissector.cpp
    src/parsing/dissectors/shared/dissector_utils.cpp
    src/parsing/dissectors/link/ethernet_dissector.cpp
    src/parsing/dissectors/link/ethernet_payload.cpp
    src/parsing/dissectors/link/frame_dissector.cpp
    src/parsing/dissectors/link/linux_cooked_dissector.cpp
    src/parsing/dissectors/link/llc_dissector.cpp
    src/parsing/dissectors/link/lldp_dissector.cpp
    src/parsing/dissectors/network/arp_dissector.cpp
    src/parsing/dissectors/network/icmp_extension.cpp
    src/parsing/dissectors/network/icmpv4_dissector.cpp
    src/parsing/dissectors/network/icmpv6_dissector.cpp
    src/parsing/dissectors/network/igmp_dissector.cpp
    src/parsing/dissectors/network/ipv4_dissector.cpp
    src/parsing/dissectors/network/ipv6_dissector.cpp
    src/parsing/dissectors/network/mld_dissector.cpp
    src/parsing/dissectors/link/null_loopback_dissector.cpp
    src/parsing/dissectors/link/raw_dissector.cpp
    src/parsing/dissectors/link/snap_dissector.cpp
    src/parsing/dissectors/link/stp_dissector.cpp
    src/parsing/dissectors/transport/tcp_dissector.cpp
    src/parsing/dissectors/transport/udp_dissector.cpp
    src/parsing/dissectors/tunnel/geneve_dissector.cpp
    src/parsing/dissectors/tunnel/gre_dissector.cpp
    src/parsing/dissectors/tunnel/mpls_dissector.cpp
    src/parsing/dissectors/tunnel/vxlan_dissector.cpp
    src/parsing/dissectors/link/vlan_dissector.cpp
    src/parsing/packet_tree_codec.cpp
    src/parsing/packet_parser.cpp
    src/parsing/packet_view.cpp
    src/parsing/parsed_tree.cpp
    src/parsing/reassembly_store.cpp
    src/parsing/registry.cpp
    src/parsing/summary_extractor.cpp
    src/replay/replay_store.cpp
    src/sniffing/interface_discovery.cpp
    src/sniffing/internal_stats.cpp
    src/sniffing/link_type.cpp
    src/sniffing/live_pcap_packet_source.cpp
    src/sniffing/network_sniffer.cpp
    src/sniffing/packet_identity.cpp
    src/sniffing/offline_pcap_packet_source.cpp
    src/sniffing/packet_ring.cpp
    src/sniffing/packet_source.cpp
    src/sniffing/pcap_handle.cpp
    src/sniffing/sniffer_error.cpp
    src/sniffing/sniffer_options.cpp
    src/sniffing/sniffer_options_validation.cpp
    src/sniffing/sniffer_runtime.cpp
    "${PACKET_TREE_GENERATED_HEADER}"
)

target_include_directories(pruftnet_sniffing
    PUBLIC
        "${CMAKE_CURRENT_SOURCE_DIR}/include"
    PRIVATE
        "${CMAKE_CURRENT_SOURCE_DIR}/src"
        "${PACKET_TREE_GENERATED_DIR}"
        "${flatbuffers_SOURCE_DIR}/include"
)

target_link_libraries(pruftnet_sniffing PUBLIC PCAP::PCAP)
if(WIN32)
    target_link_libraries(pruftnet_sniffing PRIVATE bcrypt)
endif()
target_compile_features(pruftnet_sniffing PUBLIC cxx_std_20)

add_library(pruftnet_capture_worker_protocol STATIC
    tools/capture_worker_protocol.cpp
)
target_include_directories(pruftnet_capture_worker_protocol
    PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}"
)
target_compile_features(pruftnet_capture_worker_protocol PUBLIC cxx_std_20)
pruftnet_enable_warnings(pruftnet_capture_worker_protocol)

add_executable(pruftnet_capture_worker
    tools/capture_worker_main.cpp
    tools/capture_worker.cpp
)
target_include_directories(pruftnet_capture_worker PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}/src")
target_link_libraries(pruftnet_capture_worker
    PRIVATE
        pruftnet_capture_worker_protocol
        pruftnet_sniffing
)
pruftnet_enable_warnings(pruftnet_capture_worker)

include(CheckIPOSupported)
check_ipo_supported(RESULT PRUFTNET_IPO_SUPPORTED OUTPUT PRUFTNET_IPO_ERROR LANGUAGES CXX)
if(PRUFTNET_IPO_SUPPORTED)
    set_property(TARGET pruftnet_sniffing PROPERTY INTERPROCEDURAL_OPTIMIZATION_RELEASE TRUE)
endif()

target_compile_definitions(pruftnet_sniffing PRIVATE
    $<$<BOOL:${PRUFTNET_HAVE_PCAP_SET_TSTAMP_PRECISION}>:PRUFTNET_HAVE_PCAP_SET_TSTAMP_PRECISION=1>
    $<$<BOOL:${PRUFTNET_HAVE_PCAP_SET_TSTAMP_TYPE}>:PRUFTNET_HAVE_PCAP_SET_TSTAMP_TYPE=1>
    $<$<BOOL:${PRUFTNET_HAVE_PCAP_TSTAMP_TYPE_NAME_TO_VAL}>:PRUFTNET_HAVE_PCAP_TSTAMP_TYPE_NAME_TO_VAL=1>
    $<$<BOOL:${PRUFTNET_HAVE_PCAP_SET_RFMON}>:PRUFTNET_HAVE_PCAP_SET_RFMON=1>
    $<$<BOOL:${PRUFTNET_HAVE_PCAP_CAN_SET_RFMON}>:PRUFTNET_HAVE_PCAP_CAN_SET_RFMON=1>
    $<$<BOOL:${PRUFTNET_HAVE_PCAP_SET_DATALINK}>:PRUFTNET_HAVE_PCAP_SET_DATALINK=1>
    $<$<BOOL:${PRUFTNET_HAVE_PCAP_LIST_DATALINKS}>:PRUFTNET_HAVE_PCAP_LIST_DATALINKS=1>
    $<$<BOOL:${PRUFTNET_HAVE_PCAP_FREE_DATALINKS}>:PRUFTNET_HAVE_PCAP_FREE_DATALINKS=1>
    $<$<BOOL:${PRUFTNET_HAVE_PCAP_LIST_TSTAMP_TYPES}>:PRUFTNET_HAVE_PCAP_LIST_TSTAMP_TYPES=1>
    $<$<BOOL:${PRUFTNET_HAVE_PCAP_FREE_TSTAMP_TYPES}>:PRUFTNET_HAVE_PCAP_FREE_TSTAMP_TYPES=1>
    $<$<BOOL:${PRUFTNET_HAVE_PCAP_STATUSTOSTR}>:PRUFTNET_HAVE_PCAP_STATUSTOSTR=1>
    $<$<BOOL:${PRUFTNET_HAVE_PCAP_DATALINK_NAME}>:PRUFTNET_HAVE_PCAP_DATALINK_NAME=1>
    $<$<BOOL:${PRUFTNET_HAVE_PCAP_DATALINK_DESCRIPTION}>:PRUFTNET_HAVE_PCAP_DATALINK_DESCRIPTION=1>
    $<$<BOOL:${PRUFTNET_HAVE_PCAP_TSTAMP_TYPE_VAL_TO_NAME}>:PRUFTNET_HAVE_PCAP_TSTAMP_TYPE_VAL_TO_NAME=1>
    $<$<BOOL:${PRUFTNET_HAVE_PCAP_TSTAMP_TYPE_VAL_TO_DESCRIPTION}>:PRUFTNET_HAVE_PCAP_TSTAMP_TYPE_VAL_TO_DESCRIPTION=1>
)

pruftnet_enable_warnings(pruftnet_sniffing)

include(PruftnetTests)
include(PruftnetBenchmarks)
include(PruftnetFuzzers)

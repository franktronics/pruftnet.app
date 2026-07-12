cmake_minimum_required(VERSION 3.24)

project(PruftnetSniffing VERSION 0.1.0 LANGUAGES CXX)

option(PRUFTNET_SNIFFING_BUILD_TESTS "Build C++ sniffing tests" ON)
option(PRUFTNET_SNIFFING_BUILD_BENCHMARKS "Build C++ sniffing benchmarks" OFF)
option(PRUFTNET_SNIFFING_BUILD_FUZZERS "Build C++ sniffing fuzz harnesses" OFF)
option(PRUFTNET_SNIFFING_USE_LIBFUZZER "Build fuzz harnesses for libFuzzer instead of standalone execution" OFF)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

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
    src/parsing/dissector_catalog.cpp
    src/parsing/dissector_context.cpp
    src/parsing/dissectors/arp_dissector.cpp
    src/parsing/dissectors/ethernet_dissector.cpp
    src/parsing/dissectors/frame_dissector.cpp
    src/parsing/dissectors/icmpv4_dissector.cpp
    src/parsing/dissectors/icmpv6_dissector.cpp
    src/parsing/dissectors/ipv4_dissector.cpp
    src/parsing/dissectors/ipv6_dissector.cpp
    src/parsing/dissectors/tcp_dissector.cpp
    src/parsing/dissectors/udp_dissector.cpp
    src/parsing/dissectors/vlan_dissector.cpp
    src/parsing/packet_tree_codec.cpp
    src/parsing/packet_parser.cpp
    src/parsing/packet_view.cpp
    src/parsing/parsed_tree.cpp
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

add_executable(pruftnet_capture_worker tools/capture_worker.cpp)
target_include_directories(pruftnet_capture_worker PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}/src")
target_link_libraries(pruftnet_capture_worker PRIVATE pruftnet_sniffing)

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

if(MSVC)
    target_compile_options(pruftnet_sniffing PRIVATE /W4)
else()
    target_compile_options(pruftnet_sniffing PRIVATE -Wall -Wextra -Wpedantic)
endif()

if(PRUFTNET_SNIFFING_BUILD_TESTS)
    enable_testing()

    function(pruftnet_add_sniffing_test target source)
        add_executable(${target} ${source})
        target_include_directories(${target}
            PRIVATE
                "${CMAKE_CURRENT_SOURCE_DIR}"
                "${CMAKE_CURRENT_SOURCE_DIR}/src"
        )
        target_link_libraries(${target} PRIVATE pruftnet_sniffing)
        if(MSVC)
            target_compile_options(${target} PRIVATE /UNDEBUG)
        else()
            target_compile_options(${target} PRIVATE -UNDEBUG)
        endif()
    endfunction()

    pruftnet_add_sniffing_test(packet_ring_tests tests/unit/packet_ring_tests.cpp)
    add_test(NAME unit.packet_ring COMMAND packet_ring_tests)

    pruftnet_add_sniffing_test(packet_view_tests tests/unit/packet_view_tests.cpp)
    add_test(NAME unit.packet_view COMMAND packet_view_tests)

    pruftnet_add_sniffing_test(registry_tests tests/unit/registry_tests.cpp)
    add_test(NAME unit.registry COMMAND registry_tests)

    pruftnet_add_sniffing_test(parsed_tree_tests tests/unit/parsed_tree_tests.cpp)
    add_test(NAME unit.parsed_tree COMMAND parsed_tree_tests)

    pruftnet_add_sniffing_test(parsed_tree_allocation_tests tests/unit/parsed_tree_allocation_tests.cpp)
    target_include_directories(parsed_tree_allocation_tests PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}")
    add_test(NAME unit.parsed_tree_allocations COMMAND parsed_tree_allocation_tests)

    pruftnet_add_sniffing_test(utf8_tests tests/unit/utf8_tests.cpp)
    add_test(NAME unit.utf8 COMMAND utf8_tests)

    pruftnet_add_sniffing_test(packet_tree_codec_tests tests/unit/packet_tree_codec_tests.cpp)
    target_include_directories(packet_tree_codec_tests
        PRIVATE
            "${PACKET_TREE_GENERATED_DIR}"
            "${flatbuffers_SOURCE_DIR}/include"
    )
    add_test(NAME unit.packet_tree_codec COMMAND packet_tree_codec_tests)

    pruftnet_add_sniffing_test(packet_parser_tests tests/unit/packet_parser_tests.cpp)
    add_test(NAME unit.packet_parser COMMAND packet_parser_tests)

    pruftnet_add_sniffing_test(packet_parser_allocation_tests tests/unit/packet_parser_allocation_tests.cpp)
    add_test(NAME unit.packet_parser_allocations COMMAND packet_parser_allocation_tests)

    pruftnet_add_sniffing_test(dissector_catalog_tests tests/unit/dissector_catalog_tests.cpp)
    add_test(NAME unit.dissector_catalog COMMAND dissector_catalog_tests)

    pruftnet_add_sniffing_test(phase5_dissector_tests tests/unit/phase5_dissector_tests.cpp)
    add_test(NAME unit.phase5_dissectors COMMAND phase5_dissector_tests)

    pruftnet_add_sniffing_test(replay_store_tests tests/unit/replay_store_tests.cpp)
    add_test(NAME unit.replay_store COMMAND replay_store_tests)

    pruftnet_add_sniffing_test(summary_extractor_tests tests/unit/summary_extractor_tests.cpp)
    add_test(NAME unit.summary_extractor COMMAND summary_extractor_tests)

    add_executable(packet_tree_fixture_writer tests/packet_tree_fixture_writer.cpp)
    target_include_directories(packet_tree_fixture_writer
        PRIVATE
            "${CMAKE_CURRENT_SOURCE_DIR}"
            "${CMAKE_CURRENT_SOURCE_DIR}/src"
    )
    target_link_libraries(packet_tree_fixture_writer PRIVATE pruftnet_sniffing)

    add_executable(parser_packet_tree_fixture_writer tests/parser_packet_tree_fixture_writer.cpp)
    target_include_directories(parser_packet_tree_fixture_writer
        PRIVATE
            "${CMAKE_CURRENT_SOURCE_DIR}"
            "${CMAKE_CURRENT_SOURCE_DIR}/src"
    )
    target_link_libraries(parser_packet_tree_fixture_writer PRIVATE pruftnet_sniffing)

    pruftnet_add_sniffing_test(sniffer_options_tests tests/unit/sniffer_options_tests.cpp)
    add_test(NAME unit.sniffer_options COMMAND sniffer_options_tests)

    pruftnet_add_sniffing_test(sniffing_offline_pcap_tests tests/integration/sniffing_offline_pcap_tests.cpp)
    target_compile_definitions(sniffing_offline_pcap_tests
        PRIVATE
            PRUFTNET_TEST_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/tests/fixtures"
    )
    add_test(NAME integration.sniffing_offline_pcap COMMAND sniffing_offline_pcap_tests)

    pruftnet_add_sniffing_test(replay_pipeline_tests tests/integration/replay_pipeline_tests.cpp)
    target_include_directories(replay_pipeline_tests PRIVATE "${PACKET_TREE_GENERATED_DIR}" "${flatbuffers_SOURCE_DIR}/include")
    target_compile_definitions(replay_pipeline_tests PRIVATE PRUFTNET_TEST_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/tests/fixtures")
    add_test(NAME integration.replay_pipeline COMMAND replay_pipeline_tests)

    pruftnet_add_sniffing_test(sniffing_offline_bpf_tests tests/integration/sniffing_offline_bpf_tests.cpp)
    target_compile_definitions(sniffing_offline_bpf_tests
        PRIVATE
            PRUFTNET_TEST_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/tests/fixtures"
    )
    add_test(NAME integration.sniffing_offline_bpf COMMAND sniffing_offline_bpf_tests)

    pruftnet_add_sniffing_test(sniffing_offline_invalid_pcap_tests tests/integration/sniffing_offline_invalid_pcap_tests.cpp)
    target_compile_definitions(sniffing_offline_invalid_pcap_tests
        PRIVATE
            PRUFTNET_TEST_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/tests/fixtures"
    )
    add_test(NAME integration.sniffing_offline_invalid_pcap COMMAND sniffing_offline_invalid_pcap_tests)

    pruftnet_add_sniffing_test(sniffing_offline_multi_pcap_tests tests/integration/sniffing_offline_multi_pcap_tests.cpp)
    target_compile_definitions(sniffing_offline_multi_pcap_tests
        PRIVATE
            PRUFTNET_TEST_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/tests/fixtures"
    )
    add_test(NAME integration.sniffing_offline_multi_pcap COMMAND sniffing_offline_multi_pcap_tests)

    pruftnet_add_sniffing_test(sniffing_runtime_lifecycle_tests tests/integration/sniffing_runtime_lifecycle_tests.cpp)
    add_test(NAME integration.sniffing_runtime_lifecycle COMMAND sniffing_runtime_lifecycle_tests)

    pruftnet_add_sniffing_test(sniffing_runtime_error_tests tests/integration/sniffing_runtime_error_tests.cpp)
    add_test(NAME integration.sniffing_runtime_errors COMMAND sniffing_runtime_error_tests)

    pruftnet_add_sniffing_test(sniffing_ring_pressure_tests tests/integration/sniffing_ring_pressure_tests.cpp)
    add_test(NAME integration.sniffing_ring_pressure COMMAND sniffing_ring_pressure_tests)

    pruftnet_add_sniffing_test(sniffing_multi_interface_tests tests/integration/sniffing_multi_interface_tests.cpp)
    add_test(NAME integration.sniffing_multi_interface COMMAND sniffing_multi_interface_tests)

    pruftnet_add_sniffing_test(sniffing_interface_discovery_tests tests/integration/sniffing_interface_discovery_tests.cpp)
    add_test(NAME integration.sniffing_interface_discovery COMMAND sniffing_interface_discovery_tests)

    pruftnet_add_sniffing_test(sniffing_interface_capabilities_live_tests tests/integration/sniffing_interface_capabilities_live_tests.cpp)
    add_test(NAME integration.sniffing_interface_capabilities_live COMMAND sniffing_interface_capabilities_live_tests)
    set_tests_properties(integration.sniffing_interface_capabilities_live PROPERTIES SKIP_RETURN_CODE 77)

    pruftnet_add_sniffing_test(sniffing_live_tests tests/integration/sniffing_live_tests.cpp)
    add_test(NAME integration.sniffing_live COMMAND sniffing_live_tests)
    set_tests_properties(integration.sniffing_live PROPERTIES SKIP_RETURN_CODE 77)
endif()

if(PRUFTNET_SNIFFING_BUILD_BENCHMARKS)
    add_executable(sniffing_runtime_benchmark benchmarks/sniffing_runtime_benchmark.cpp)
    target_include_directories(sniffing_runtime_benchmark
        PRIVATE
            "${CMAKE_CURRENT_SOURCE_DIR}"
            "${CMAKE_CURRENT_SOURCE_DIR}/src"
    )
    target_link_libraries(sniffing_runtime_benchmark PRIVATE pruftnet_sniffing)

    add_executable(packet_tree_benchmark benchmarks/packet_tree_benchmark.cpp)
    target_include_directories(packet_tree_benchmark PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}")
    target_link_libraries(packet_tree_benchmark PRIVATE pruftnet_sniffing)

    add_executable(packet_parser_benchmark benchmarks/packet_parser_benchmark.cpp)
    target_include_directories(packet_parser_benchmark
        PRIVATE
            "${CMAKE_CURRENT_SOURCE_DIR}"
            "${CMAKE_CURRENT_SOURCE_DIR}/src"
    )
    target_link_libraries(packet_parser_benchmark PRIVATE pruftnet_sniffing)
    if(PRUFTNET_IPO_SUPPORTED)
        set_property(TARGET packet_parser_benchmark PROPERTY INTERPROCEDURAL_OPTIMIZATION_RELEASE TRUE)
    endif()

    set(PACKET_CODEC_GENERATED_DIR "${CMAKE_CURRENT_BINARY_DIR}/generated/packet_codec")
    set(PACKET_CODEC_GENERATED_HEADER "${PACKET_CODEC_GENERATED_DIR}/packet_codec_generated.h")
    add_custom_command(
        OUTPUT "${PACKET_CODEC_GENERATED_HEADER}"
        COMMAND "${CMAKE_COMMAND}" -E make_directory "${PACKET_CODEC_GENERATED_DIR}"
        COMMAND "${PRUFTNET_FLATC_COMMAND}" --cpp -o "${PACKET_CODEC_GENERATED_DIR}"
                "${CMAKE_CURRENT_SOURCE_DIR}/benchmarks/packet_codec/packet_codec.fbs"
        DEPENDS
            ${PRUFTNET_FLATC_DEPENDS}
            "${CMAKE_CURRENT_SOURCE_DIR}/benchmarks/packet_codec/packet_codec.fbs"
        VERBATIM
    )

    add_executable(packet_codec_benchmark
        benchmarks/packet_codec/custom_packet_codec.cpp
        benchmarks/packet_codec/flatbuffers_packet_codec.cpp
        benchmarks/packet_codec/packet_codec_benchmark.cpp
        benchmarks/packet_codec/packet_codec_model.cpp
        "${PACKET_CODEC_GENERATED_HEADER}"
    )
    target_include_directories(packet_codec_benchmark
        PRIVATE
            "${CMAKE_CURRENT_SOURCE_DIR}"
            "${PACKET_CODEC_GENERATED_DIR}"
            "${flatbuffers_SOURCE_DIR}/include"
    )
    target_compile_features(packet_codec_benchmark PRIVATE cxx_std_20)
    if(MSVC)
        target_compile_options(packet_codec_benchmark PRIVATE /W4)
    else()
        target_compile_options(packet_codec_benchmark PRIVATE -Wall -Wextra -Wpedantic)
    endif()
endif()

if(PRUFTNET_SNIFFING_BUILD_FUZZERS)
    add_executable(packet_parser_fuzzer fuzz/packet_parser_fuzzer.cpp)
    target_include_directories(packet_parser_fuzzer
        PRIVATE
            "${CMAKE_CURRENT_SOURCE_DIR}/src"
    )
    target_link_libraries(packet_parser_fuzzer PRIVATE pruftnet_sniffing)

    add_executable(packet_view_fuzzer fuzz/packet_view_fuzzer.cpp)
    target_link_libraries(packet_view_fuzzer PRIVATE pruftnet_sniffing)

    add_executable(registry_fuzzer fuzz/registry_fuzzer.cpp)
    target_link_libraries(registry_fuzzer PRIVATE pruftnet_sniffing)

    add_executable(parsed_tree_fuzzer fuzz/parsed_tree_fuzzer.cpp)
    target_link_libraries(parsed_tree_fuzzer PRIVATE pruftnet_sniffing)

    add_executable(packet_tree_codec_fuzzer fuzz/packet_tree_codec_fuzzer.cpp)
    target_include_directories(packet_tree_codec_fuzzer PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}")
    target_link_libraries(packet_tree_codec_fuzzer PRIVATE pruftnet_sniffing)

    if(PRUFTNET_SNIFFING_USE_LIBFUZZER)
        if(MSVC)
            message(FATAL_ERROR
                "PRUFTNET_SNIFFING_USE_LIBFUZZER currently requires a Clang or GCC-style toolchain")
        endif()
        include(CheckCXXSourceCompiles)
        set(CMAKE_REQUIRED_FLAGS_SAVED "${CMAKE_REQUIRED_FLAGS}")
        set(CMAKE_REQUIRED_FLAGS "${CMAKE_REQUIRED_FLAGS} -fsanitize=fuzzer,address")
        check_cxx_source_compiles(
            "#include <cstddef>\n#include <cstdint>\nextern \"C\" int LLVMFuzzerTestOneInput(const std::uint8_t*, std::size_t) { return 0; }"
            PRUFTNET_HAVE_LIBFUZZER
        )
        set(CMAKE_REQUIRED_FLAGS "${CMAKE_REQUIRED_FLAGS_SAVED}")
        if(NOT PRUFTNET_HAVE_LIBFUZZER)
            message(FATAL_ERROR "PRUFTNET_SNIFFING_USE_LIBFUZZER requires a compiler and linker with -fsanitize=fuzzer,address support")
        endif()

        target_compile_options(packet_parser_fuzzer PRIVATE -fsanitize=fuzzer,address)
        target_link_options(packet_parser_fuzzer PRIVATE -fsanitize=fuzzer,address)
        target_compile_options(packet_view_fuzzer PRIVATE -fsanitize=fuzzer,address)
        target_link_options(packet_view_fuzzer PRIVATE -fsanitize=fuzzer,address)
        target_compile_options(registry_fuzzer PRIVATE -fsanitize=fuzzer,address)
        target_link_options(registry_fuzzer PRIVATE -fsanitize=fuzzer,address)
        target_compile_options(parsed_tree_fuzzer PRIVATE -fsanitize=fuzzer,address)
        target_link_options(parsed_tree_fuzzer PRIVATE -fsanitize=fuzzer,address)
        target_compile_options(packet_tree_codec_fuzzer PRIVATE -fsanitize=fuzzer,address)
        target_link_options(packet_tree_codec_fuzzer PRIVATE -fsanitize=fuzzer,address)
    else()
        target_compile_definitions(packet_parser_fuzzer PRIVATE PRUFTNET_STANDALONE_FUZZER=1)
        target_compile_definitions(packet_view_fuzzer PRIVATE PRUFTNET_STANDALONE_FUZZER=1)
        target_compile_definitions(registry_fuzzer PRIVATE PRUFTNET_STANDALONE_FUZZER=1)
        target_compile_definitions(parsed_tree_fuzzer PRIVATE PRUFTNET_STANDALONE_FUZZER=1)
        target_compile_definitions(packet_tree_codec_fuzzer PRIVATE PRUFTNET_STANDALONE_FUZZER=1)
    endif()
endif()

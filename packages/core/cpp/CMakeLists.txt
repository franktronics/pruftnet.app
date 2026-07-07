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

add_library(pruftnet_sniffing STATIC
    src/sniffing/interface_discovery.cpp
    src/sniffing/internal_stats.cpp
    src/sniffing/link_type.cpp
    src/sniffing/live_pcap_packet_source.cpp
    src/sniffing/network_sniffer.cpp
    src/sniffing/packet_cursor.cpp
    src/sniffing/packet_parser.cpp
    src/sniffing/offline_pcap_packet_source.cpp
    src/sniffing/packet_ring.cpp
    src/sniffing/packet_source.cpp
    src/sniffing/pcap_handle.cpp
    src/sniffing/sniffer_error.cpp
    src/sniffing/sniffer_options.cpp
    src/sniffing/sniffer_options_validation.cpp
    src/sniffing/sniffer_runtime.cpp
)

target_include_directories(pruftnet_sniffing
    PUBLIC
        "${CMAKE_CURRENT_SOURCE_DIR}/include"
    PRIVATE
        "${CMAKE_CURRENT_SOURCE_DIR}/src"
)

target_link_libraries(pruftnet_sniffing PUBLIC PCAP::PCAP)
target_compile_features(pruftnet_sniffing PUBLIC cxx_std_20)

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
    endfunction()

    pruftnet_add_sniffing_test(packet_ring_tests tests/unit/packet_ring_tests.cpp)
    add_test(NAME unit.packet_ring COMMAND packet_ring_tests)

    pruftnet_add_sniffing_test(sniffer_options_tests tests/unit/sniffer_options_tests.cpp)
    add_test(NAME unit.sniffer_options COMMAND sniffer_options_tests)

    pruftnet_add_sniffing_test(packet_parser_tests tests/unit/packet_parser_tests.cpp)
    add_test(NAME unit.packet_parser COMMAND packet_parser_tests)

    pruftnet_add_sniffing_test(sniffing_offline_pcap_tests tests/integration/sniffing_offline_pcap_tests.cpp)
    target_compile_definitions(sniffing_offline_pcap_tests
        PRIVATE
            PRUFTNET_TEST_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/tests/fixtures"
    )
    add_test(NAME integration.sniffing_offline_pcap COMMAND sniffing_offline_pcap_tests)

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
endif()

if(PRUFTNET_SNIFFING_BUILD_FUZZERS)
    add_executable(packet_parser_fuzzer fuzz/packet_parser_fuzzer.cpp)
    target_include_directories(packet_parser_fuzzer
        PRIVATE
            "${CMAKE_CURRENT_SOURCE_DIR}/src"
    )
    target_link_libraries(packet_parser_fuzzer PRIVATE pruftnet_sniffing)

    if(PRUFTNET_SNIFFING_USE_LIBFUZZER)
        target_compile_options(packet_parser_fuzzer PRIVATE -fsanitize=fuzzer,address)
        target_link_options(packet_parser_fuzzer PRIVATE -fsanitize=fuzzer,address)
    else()
        target_compile_definitions(packet_parser_fuzzer PRIVATE PRUFTNET_STANDALONE_FUZZER=1)
    endif()
endif()

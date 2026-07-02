cmake_minimum_required(VERSION 3.24)

project(PruftnetSniffing VERSION 0.1.0 LANGUAGES CXX)

option(PRUFTNET_SNIFFING_BUILD_EXAMPLES "Build standalone sniffing examples" ON)
option(PRUFTNET_SNIFFING_BUILD_TESTS "Build C++ sniffing tests" ON)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

list(APPEND CMAKE_MODULE_PATH "${CMAKE_CURRENT_SOURCE_DIR}/cmake")

find_package(PCAP REQUIRED)

include(CheckSymbolExists)

set(CMAKE_REQUIRED_INCLUDES ${PCAP_INCLUDE_DIRS})
set(CMAKE_REQUIRED_LIBRARIES ${PCAP_LIBRARIES})

check_symbol_exists(pcap_set_tstamp_precision "pcap/pcap.h" PRUFTNET_HAVE_PCAP_SET_TSTAMP_PRECISION)
check_symbol_exists(pcap_statustostr "pcap/pcap.h" PRUFTNET_HAVE_PCAP_STATUSTOSTR)
check_symbol_exists(pcap_datalink_val_to_name "pcap/pcap.h" PRUFTNET_HAVE_PCAP_DATALINK_NAME)

add_library(pruftnet_sniffing STATIC
    src/sniffing/empty_packet_parser.cpp
    src/sniffing/internal_stats.cpp
    src/sniffing/link_type.cpp
    src/sniffing/network_sniffer.cpp
    src/sniffing/packet_ring.cpp
    src/sniffing/pcap_session.cpp
    src/sniffing/sniffer_error.cpp
    src/sniffing/sniffer_options.cpp
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
    $<$<BOOL:${PRUFTNET_HAVE_PCAP_STATUSTOSTR}>:PRUFTNET_HAVE_PCAP_STATUSTOSTR=1>
    $<$<BOOL:${PRUFTNET_HAVE_PCAP_DATALINK_NAME}>:PRUFTNET_HAVE_PCAP_DATALINK_NAME=1>
)

if(MSVC)
    target_compile_options(pruftnet_sniffing PRIVATE /W4)
else()
    target_compile_options(pruftnet_sniffing PRIVATE -Wall -Wextra -Wpedantic)
endif()

if(PRUFTNET_SNIFFING_BUILD_EXAMPLES)
    add_executable(sniffing_smoke_test examples/sniffing_smoke_test.cpp)
    target_link_libraries(sniffing_smoke_test PRIVATE pruftnet_sniffing)
endif()

if(PRUFTNET_SNIFFING_BUILD_TESTS)
    enable_testing()

    add_executable(packet_ring_tests tests/packet_ring_tests.cpp)
    target_include_directories(packet_ring_tests PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}/src")
    target_link_libraries(packet_ring_tests PRIVATE pruftnet_sniffing)
    add_test(NAME packet_ring_tests COMMAND packet_ring_tests)
endif()

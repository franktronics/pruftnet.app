cmake_minimum_required(VERSION 3.24)

project(PruftnetCapture VERSION 0.1.0 LANGUAGES CXX)

option(PRUFTNET_CAPTURE_BUILD_TOOLS "Build standalone capture tools" ON)
option(PRUFTNET_CAPTURE_BUILD_TESTS "Build C++ capture tests" ON)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

list(APPEND CMAKE_MODULE_PATH "${CMAKE_CURRENT_SOURCE_DIR}/cmake")

find_package(PCAP REQUIRED)

include(CheckSymbolExists)

set(CMAKE_REQUIRED_INCLUDES ${PCAP_INCLUDE_DIRS})
set(CMAKE_REQUIRED_LIBRARIES ${PCAP_LIBRARIES})

check_symbol_exists(pcap_set_immediate_mode "pcap/pcap.h" PRUFTNET_HAVE_PCAP_SET_IMMEDIATE_MODE)
check_symbol_exists(pcap_set_tstamp_precision "pcap/pcap.h" PRUFTNET_HAVE_PCAP_SET_TSTAMP_PRECISION)
check_symbol_exists(pcap_setdirection "pcap/pcap.h" PRUFTNET_HAVE_PCAP_SETDIRECTION)
check_symbol_exists(pcap_set_rfmon "pcap/pcap.h" PRUFTNET_HAVE_PCAP_SET_RFMON)
check_symbol_exists(pcap_statustostr "pcap/pcap.h" PRUFTNET_HAVE_PCAP_STATUSTOSTR)
check_symbol_exists(pcap_datalink_val_to_description "pcap/pcap.h" PRUFTNET_HAVE_PCAP_DATALINK_DESCRIPTION)

add_library(pruftnet_capture STATIC
    src/capture/capture_engine.cpp
    src/capture/capture_error.cpp
    src/capture/packet_ring.cpp
    src/capture/pcap_device.cpp
    src/capture/pcap_handle.cpp
    src/capture/pcap_linktype.cpp
    src/capture/raw_packet_printer.cpp
    src/capture/stats.cpp
)

target_include_directories(pruftnet_capture
    PUBLIC
        "${CMAKE_CURRENT_SOURCE_DIR}/include"
)

target_link_libraries(pruftnet_capture PUBLIC PCAP::PCAP)
target_compile_features(pruftnet_capture PUBLIC cxx_std_20)

target_compile_definitions(pruftnet_capture PRIVATE
    $<$<BOOL:${PRUFTNET_HAVE_PCAP_SET_IMMEDIATE_MODE}>:PRUFTNET_HAVE_PCAP_SET_IMMEDIATE_MODE=1>
    $<$<BOOL:${PRUFTNET_HAVE_PCAP_SET_TSTAMP_PRECISION}>:PRUFTNET_HAVE_PCAP_SET_TSTAMP_PRECISION=1>
    $<$<BOOL:${PRUFTNET_HAVE_PCAP_SETDIRECTION}>:PRUFTNET_HAVE_PCAP_SETDIRECTION=1>
    $<$<BOOL:${PRUFTNET_HAVE_PCAP_SET_RFMON}>:PRUFTNET_HAVE_PCAP_SET_RFMON=1>
    $<$<BOOL:${PRUFTNET_HAVE_PCAP_STATUSTOSTR}>:PRUFTNET_HAVE_PCAP_STATUSTOSTR=1>
    $<$<BOOL:${PRUFTNET_HAVE_PCAP_DATALINK_DESCRIPTION}>:PRUFTNET_HAVE_PCAP_DATALINK_DESCRIPTION=1>
)

if(MSVC)
    target_compile_options(pruftnet_capture PRIVATE /W4)
else()
    target_compile_options(pruftnet_capture PRIVATE -Wall -Wextra -Wpedantic)
endif()

if(PRUFTNET_CAPTURE_BUILD_TOOLS)
    add_executable(pruftnet-sniffer src/tools/pruftnet-sniffer/main.cpp)
    target_link_libraries(pruftnet-sniffer PRIVATE pruftnet_capture)
endif()

if(PRUFTNET_CAPTURE_BUILD_TESTS)
    enable_testing()

    add_executable(packet_ring_tests tests/packet_ring_tests.cpp)
    target_link_libraries(packet_ring_tests PRIVATE pruftnet_capture)
    add_test(NAME packet_ring_tests COMMAND packet_ring_tests)
endif()

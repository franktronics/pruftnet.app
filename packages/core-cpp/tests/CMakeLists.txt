cmake_minimum_required(VERSION 3.15)
project(core_tests)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

include(FetchContent)

FetchContent_Declare(
  exprtk
  GIT_REPOSITORY https://github.com/ArashPartow/exprtk.git
  GIT_TAG master)
FetchContent_MakeAvailable(exprtk)

FetchContent_Declare(
  nlohmann_json
  GIT_REPOSITORY https://github.com/nlohmann/json.git
  GIT_TAG v3.11.3)
FetchContent_MakeAvailable(nlohmann_json)

include_directories(${exprtk_SOURCE_DIR})
include_directories(${nlohmann_json_SOURCE_DIR}/include)
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/../src/cpp)

file(STRINGS "sources.txt" CORE_SOURCES)

if(NOT CMAKE_SYSTEM_NAME STREQUAL "Linux")
  message(STATUS "Skipping sniffer sources on non-Linux platform")
  list(FILTER CORE_SOURCES EXCLUDE REGEX ".*/sniffer/.*")
  list(FILTER CORE_SOURCES EXCLUDE REGEX ".*/analyser/.*")
endif()

add_library(core_lib STATIC ${CORE_SOURCES})
target_link_libraries(core_lib nlohmann_json::nlohmann_json)

function(add_core_test TEST_NAME)
  add_executable(${TEST_NAME} ${TEST_NAME}.cpp)
  target_link_libraries(${TEST_NAME} core_lib)
endfunction()

file(GLOB TEST_FILES "test_*.cpp")
foreach(TEST_FILE ${TEST_FILES})
  get_filename_component(TEST_NAME ${TEST_FILE} NAME_WE)
  add_core_test(${TEST_NAME})
endforeach()

cmake_minimum_required(VERSION 3.16)
project(CoreTests)

# Set C++ standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find or fetch Catch2
find_package(Catch2 3 QUIET)

if(NOT Catch2_FOUND)
    # Fetch Catch2 if not found
    include(FetchContent)
    FetchContent_Declare(
        Catch2
        GIT_REPOSITORY https://github.com/catchorg/Catch2.git
        GIT_TAG        v3.4.0  # or any other version you want
    )
    FetchContent_MakeAvailable(Catch2)
endif()

# Include directories for core sources
include_directories(${CMAKE_CURRENT_SOURCE_DIR}/../src/cpp)

# Read list of core source files from configuration file
file(STRINGS "${CMAKE_CURRENT_SOURCE_DIR}/test_sources.txt" SOURCE_LIST)

# Build the list of core sources to compile
set(CORE_SOURCES)
foreach(SOURCE_FILE ${SOURCE_LIST})
    # Skip empty lines and comments
    string(STRIP "${SOURCE_FILE}" SOURCE_FILE)
    if(NOT "${SOURCE_FILE}" STREQUAL "" AND NOT "${SOURCE_FILE}" MATCHES "^#")
        list(APPEND CORE_SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/../src/cpp/${SOURCE_FILE}")
    endif()
endforeach()

# Verify that all source files exist
foreach(SOURCE_FILE ${CORE_SOURCES})
    if(NOT EXISTS ${SOURCE_FILE})
        message(FATAL_ERROR "Source file not found: ${SOURCE_FILE}")
    endif()
endforeach()

# Test files (now in the tests directory)
file(GLOB_RECURSE TEST_SOURCES 
    "${CMAKE_CURRENT_SOURCE_DIR}/*.cpp"
)

# Remove CMakeLists.txt and other non-test files from test sources
list(FILTER TEST_SOURCES INCLUDE REGEX ".*\\.test\\.cpp$")

# Create test executable (generic name for all tests)
add_executable(core_tests ${TEST_SOURCES} ${CORE_SOURCES})

# Link Catch2
target_link_libraries(core_tests PRIVATE Catch2::Catch2WithMain)

# Enable testing
enable_testing()

# Add tests to CTest
add_test(NAME core_unit_tests COMMAND core_tests)

# Optional: Add Catch2's automatic test discovery
if(TARGET Catch2::Catch2WithMain)
    include(Catch)
    catch_discover_tests(core_tests)
endif()

# Compiler-specific options
if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang")
    target_compile_options(core_tests PRIVATE -Wall -Wextra -Wpedantic)
endif()

# Enable debug info in debug builds
if(CMAKE_BUILD_TYPE STREQUAL "Debug")
    target_compile_options(core_tests PRIVATE -g)
endif()

# Print some information
message(STATUS "Test executable: core_tests")
message(STATUS "Core sources found: ${CORE_SOURCES}")
message(STATUS "Test sources found: ${TEST_SOURCES}")
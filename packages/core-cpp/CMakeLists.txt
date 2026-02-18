cmake_minimum_required(VERSION 3.15)
project(repo-core)

# Enable parallel compilation
include(ProcessorCount)
ProcessorCount(N)
if(NOT N EQUAL 0)
    set(CMAKE_BUILD_PARALLEL_LEVEL ${N})
    message(STATUS "Building with ${N} parallel jobs")
endif()

# Use ccache if available to cache compilation results
find_program(CCACHE_PROGRAM ccache)
if(CCACHE_PROGRAM)
    set(CMAKE_CXX_COMPILER_LAUNCHER "${CCACHE_PROGRAM}")
    message(STATUS "Using ccache for faster rebuilds")
endif()

# Set C++ standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Include N-API
execute_process(
  COMMAND node -p "require('node-addon-api').include"
  WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
  OUTPUT_VARIABLE NODE_ADDON_API_DIR)
string(REGEX REPLACE "[\r\n\"]" "" NODE_ADDON_API_DIR ${NODE_ADDON_API_DIR})

# Fetch external dependencies
include(FetchContent)

# ExprTk - Header-only library for mathematical expressions
FetchContent_Declare(
  exprtk
  GIT_REPOSITORY https://github.com/ArashPartow/exprtk.git
  GIT_TAG master)
FetchContent_MakeAvailable(exprtk)

# nlohmann/json - Header-only JSON library
FetchContent_Declare(
  nlohmann_json
  GIT_REPOSITORY https://github.com/nlohmann/json.git
  GIT_TAG v3.11.3)
FetchContent_MakeAvailable(nlohmann_json)

# Include directories
include_directories(${CMAKE_JS_INC})
include_directories(${NODE_ADDON_API_DIR})
include_directories(${exprtk_SOURCE_DIR})
include_directories(${nlohmann_json_SOURCE_DIR}/include)

# Add source files
file(GLOB_RECURSE SOURCE_FILES "src/cpp/*.cpp" "src/cpp/*.hpp")

# Remove Linux-specific sniffer and injector files on non-Linux platforms
if(NOT CMAKE_SYSTEM_NAME STREQUAL "Linux")
  list(FILTER SOURCE_FILES EXCLUDE REGEX ".*/sniffer/.*")
  list(FILTER SOURCE_FILES EXCLUDE REGEX ".*/injector/.*")
  list(FILTER SOURCE_FILES EXCLUDE REGEX ".*/analyser/.*")
endif()
# remove analyser files for now
list(FILTER SOURCE_FILES EXCLUDE REGEX ".*/analyser/.*")

# Create the addon
add_library(${PROJECT_NAME} SHARED ${SOURCE_FILES})
set_target_properties(${PROJECT_NAME} PROPERTIES PREFIX "" SUFFIX ".node")

# Link libraries
target_link_libraries(${PROJECT_NAME} ${CMAKE_JS_LIB})

# Link nlohmann_json (header-only but provides interface library)
target_link_libraries(${PROJECT_NAME} nlohmann_json::nlohmann_json)

# Compiler-specific options
if(MSVC
   AND CMAKE_JS_NODELIB_DEF
   AND CMAKE_JS_NODELIB_TARGET)
  # Generate node.lib
  execute_process(
    COMMAND ${CMAKE_AR} /def:${CMAKE_JS_NODELIB_DEF}
            /out:${CMAKE_JS_NODELIB_TARGET} ${CMAKE_STATIC_LINKER_FLAGS})
endif()

# Define NAPI_VERSION
add_definitions(-DNAPI_VERSION=8)

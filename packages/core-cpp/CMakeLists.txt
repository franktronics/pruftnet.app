cmake_minimum_required(VERSION 3.15)
project(repo-core)

# Set C++ standard
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Include N-API
execute_process(
  COMMAND node -p "require('node-addon-api').include"
  WORKING_DIRECTORY ${CMAKE_SOURCE_DIR}
  OUTPUT_VARIABLE NODE_ADDON_API_DIR)
string(REGEX REPLACE "[\r\n\"]" "" NODE_ADDON_API_DIR ${NODE_ADDON_API_DIR})

# Include directories
include_directories(${CMAKE_JS_INC})
include_directories(${NODE_ADDON_API_DIR})

# Add source files
file(GLOB_RECURSE SOURCE_FILES "src/cpp/*.cpp" "src/cpp/*.hpp")

# Remove Linux-specific sniffer files on non-Linux platforms
if(NOT CMAKE_SYSTEM_NAME STREQUAL "Linux")
  list(FILTER SOURCE_FILES EXCLUDE REGEX ".*/sniffer/.*")
  list(FILTER SOURCE_FILES EXCLUDE REGEX ".*/analyser/.*")
endif()

# Create the addon
add_library(${PROJECT_NAME} SHARED ${SOURCE_FILES})
set_target_properties(${PROJECT_NAME} PROPERTIES PREFIX "" SUFFIX ".node")

# Link libraries
target_link_libraries(${PROJECT_NAME} ${CMAKE_JS_LIB})

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

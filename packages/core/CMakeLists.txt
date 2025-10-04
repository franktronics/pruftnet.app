cmake_minimum_required(VERSION 3.18)
project(pruftcore VERSION 0.1.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Enable position independent code
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# (Will add node headers include path after target definition using CMAKE_JS_INC variable)

add_definitions(-DNAPI_VERSION=9)

## node-addon-api headers (header only)
add_compile_definitions(NAPI_CPP_EXCEPTIONS)

# Locate node-addon-api include directory dynamically using node
execute_process(
  COMMAND node -p "require('node-addon-api').include"
  WORKING_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}
  OUTPUT_VARIABLE NODE_ADDON_API_DIR
  ERROR_QUIET
)
if(NODE_ADDON_API_DIR)
  string(REPLACE "\n" "" NODE_ADDON_API_DIR ${NODE_ADDON_API_DIR})
  string(REPLACE "\"" "" NODE_ADDON_API_DIR ${NODE_ADDON_API_DIR})
  message(STATUS "node-addon-api include dir: ${NODE_ADDON_API_DIR}")
else()
  message(WARNING "Could not determine node-addon-api include directory. Ensure dependency is installed.")
endif()

add_library(pruftcore SHARED
  src/native/addon.cpp
  src/native/modules/packet/packet_parser.cpp
)

target_include_directories(pruftcore PRIVATE
  ${CMAKE_CURRENT_SOURCE_DIR}/src/native
  ${NODE_ADDON_API_DIR}
)

# Add Node.js headers include dir provided by cmake-js
if(DEFINED CMAKE_JS_INC)
  target_include_directories(pruftcore PRIVATE ${CMAKE_JS_INC})
endif()
if(DEFINED ENV{CMAKE_JS_INC})
  # Fallback if only environment variable is set
  target_include_directories(pruftcore PRIVATE $ENV{CMAKE_JS_INC})
endif()

# On macOS ensure correct extension name
set_target_properties(pruftcore PROPERTIES
  PREFIX ""
  SUFFIX ".node"
)

# Link with Node if cmake-js provided libs
if(DEFINED ENV{CMAKE_JS_LIB})
  target_link_libraries(pruftcore $ENV{CMAKE_JS_LIB})
endif()

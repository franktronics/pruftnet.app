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

    foreach(target
            packet_parser_fuzzer
            packet_view_fuzzer
            registry_fuzzer
            parsed_tree_fuzzer
            packet_tree_codec_fuzzer)
        pruftnet_enable_warnings(${target})
    endforeach()

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

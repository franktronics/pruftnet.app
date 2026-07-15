if(PRUFTNET_SNIFFING_BUILD_BENCHMARKS)
    add_executable(sniffing_runtime_benchmark benchmarks/sniffing_runtime_benchmark.cpp)
    target_include_directories(sniffing_runtime_benchmark
        PRIVATE
            "${CMAKE_CURRENT_SOURCE_DIR}"
            "${CMAKE_CURRENT_SOURCE_DIR}/src"
    )
    target_link_libraries(sniffing_runtime_benchmark PRIVATE pruftnet_sniffing)
    pruftnet_enable_warnings(sniffing_runtime_benchmark)

    add_executable(packet_tree_benchmark benchmarks/packet_tree_benchmark.cpp)
    target_include_directories(packet_tree_benchmark PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}")
    target_link_libraries(packet_tree_benchmark PRIVATE pruftnet_sniffing)
    pruftnet_enable_warnings(packet_tree_benchmark)

    add_executable(packet_parser_benchmark benchmarks/packet_parser_benchmark.cpp)
    target_include_directories(packet_parser_benchmark
        PRIVATE
            "${CMAKE_CURRENT_SOURCE_DIR}"
            "${CMAKE_CURRENT_SOURCE_DIR}/src"
    )
    target_link_libraries(packet_parser_benchmark PRIVATE pruftnet_sniffing)
    pruftnet_enable_warnings(packet_parser_benchmark)
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
    pruftnet_enable_warnings(packet_codec_benchmark)
endif()

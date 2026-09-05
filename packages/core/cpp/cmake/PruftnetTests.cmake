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
        pruftnet_enable_warnings(${target})
        if(MSVC)
            target_compile_options(${target} PRIVATE /UNDEBUG)
        else()
            target_compile_options(${target} PRIVATE -UNDEBUG)
        endif()
    endfunction()

    pruftnet_add_sniffing_test(packet_ring_tests tests/unit/packet_ring_tests.cpp)
    add_test(NAME unit.packet_ring COMMAND packet_ring_tests)

    add_executable(capture_worker_protocol_tests
        tests/unit/capture_worker_protocol_tests.cpp
    )
    target_link_libraries(capture_worker_protocol_tests
        PRIVATE pruftnet_capture_worker_protocol
    )
    pruftnet_enable_warnings(capture_worker_protocol_tests)
    if(MSVC)
        target_compile_options(capture_worker_protocol_tests PRIVATE /UNDEBUG)
    else()
        target_compile_options(capture_worker_protocol_tests PRIVATE -UNDEBUG)
    endif()
    add_test(NAME unit.capture_worker_protocol COMMAND capture_worker_protocol_tests)

    pruftnet_add_sniffing_test(packet_index_tests tests/unit/packet_index_tests.cpp)
    add_test(NAME unit.packet_index COMMAND packet_index_tests)

    pruftnet_add_sniffing_test(pcapng_spool_tests tests/unit/pcapng_spool_tests.cpp)
    add_test(NAME unit.pcapng_spool COMMAND pcapng_spool_tests)

    pruftnet_add_sniffing_test(packet_view_tests tests/unit/packet_view_tests.cpp)
    add_test(NAME unit.packet_view COMMAND packet_view_tests)

    pruftnet_add_sniffing_test(registry_tests tests/unit/registry_tests.cpp)
    add_test(NAME unit.registry COMMAND registry_tests)

    pruftnet_add_sniffing_test(parsed_tree_tests tests/unit/parsed_tree_tests.cpp)
    add_test(NAME unit.parsed_tree COMMAND parsed_tree_tests)

    pruftnet_add_sniffing_test(reassembly_store_tests tests/unit/reassembly_store_tests.cpp)
    add_test(NAME unit.reassembly_store COMMAND reassembly_store_tests)

    pruftnet_add_sniffing_test(parsed_tree_allocation_tests tests/unit/parsed_tree_allocation_tests.cpp)
    target_include_directories(parsed_tree_allocation_tests PRIVATE "${CMAKE_CURRENT_SOURCE_DIR}")
    add_test(NAME unit.parsed_tree_allocations COMMAND parsed_tree_allocation_tests)

    pruftnet_add_sniffing_test(utf8_tests tests/unit/utf8_tests.cpp)
    add_test(NAME unit.utf8 COMMAND utf8_tests)

    pruftnet_add_sniffing_test(packet_tree_codec_tests tests/unit/packet_tree_codec_tests.cpp)
    target_include_directories(packet_tree_codec_tests
        PRIVATE
            "${PACKET_TREE_GENERATED_DIR}"
            "${flatbuffers_SOURCE_DIR}/include"
    )
    add_test(NAME unit.packet_tree_codec COMMAND packet_tree_codec_tests)

    pruftnet_add_sniffing_test(packet_parser_tests tests/unit/packet_parser_tests.cpp)
    add_test(NAME unit.packet_parser COMMAND packet_parser_tests)

    pruftnet_add_sniffing_test(packet_parser_allocation_tests tests/unit/packet_parser_allocation_tests.cpp)
    add_test(NAME unit.packet_parser_allocations COMMAND packet_parser_allocation_tests)

    pruftnet_add_sniffing_test(dissector_catalog_tests tests/unit/dissector_catalog_tests.cpp)
    add_test(NAME unit.dissector_catalog COMMAND dissector_catalog_tests)

    pruftnet_add_sniffing_test(link_layer_dissector_tests tests/unit/link_layer_dissector_tests.cpp)
    add_test(NAME unit.link_layer_dissectors COMMAND link_layer_dissector_tests)

    pruftnet_add_sniffing_test(llc_snap_dissector_tests tests/unit/llc_snap_dissector_tests.cpp)
    add_test(NAME unit.llc_snap_dissectors COMMAND llc_snap_dissector_tests)

    pruftnet_add_sniffing_test(discovery_bridge_dissector_tests tests/unit/discovery_bridge_dissector_tests.cpp)
    add_test(NAME unit.discovery_bridge_dissectors COMMAND discovery_bridge_dissector_tests)

    pruftnet_add_sniffing_test(icmp_dissector_tests tests/unit/icmp_dissector_tests.cpp)
    add_test(NAME unit.icmp_dissectors COMMAND icmp_dissector_tests)

    pruftnet_add_sniffing_test(fragmentation_dissector_tests tests/unit/fragmentation_dissector_tests.cpp)
    add_test(NAME unit.fragmentation_dissectors COMMAND fragmentation_dissector_tests)

    pruftnet_add_sniffing_test(dns_dissector_tests tests/unit/dns_dissector_tests.cpp)
    add_test(NAME unit.dns_dissectors COMMAND dns_dissector_tests)

    pruftnet_add_sniffing_test(http_dissector_tests tests/unit/http_dissector_tests.cpp)
    add_test(NAME unit.http_dissectors COMMAND http_dissector_tests)

    pruftnet_add_sniffing_test(tls_dissector_tests tests/unit/tls_dissector_tests.cpp)
    add_test(NAME unit.tls_dissectors COMMAND tls_dissector_tests)

    pruftnet_add_sniffing_test(quic_dissector_tests tests/unit/quic_dissector_tests.cpp)
    add_test(NAME unit.quic_dissectors COMMAND quic_dissector_tests)

    pruftnet_add_sniffing_test(dhcp_dissector_tests tests/unit/dhcp_dissector_tests.cpp)
    add_test(NAME unit.dhcp_dissectors COMMAND dhcp_dissector_tests)

    pruftnet_add_sniffing_test(dhcpv6_dissector_tests tests/unit/dhcpv6_dissector_tests.cpp)
    add_test(NAME unit.dhcpv6_dissectors COMMAND dhcpv6_dissector_tests)

    pruftnet_add_sniffing_test(multicast_membership_dissector_tests tests/unit/multicast_membership_dissector_tests.cpp)
    add_test(NAME unit.multicast_membership_dissectors COMMAND multicast_membership_dissector_tests)

    pruftnet_add_sniffing_test(ntp_dissector_tests tests/unit/ntp_dissector_tests.cpp)
    add_test(NAME unit.ntp_dissectors COMMAND ntp_dissector_tests)

    pruftnet_add_sniffing_test(tunnel_mpls_dissector_tests tests/unit/tunnel_mpls_dissector_tests.cpp)
    add_test(NAME unit.tunnel_mpls_dissectors COMMAND tunnel_mpls_dissector_tests)

    pruftnet_add_sniffing_test(arp_variant_dissector_tests tests/unit/arp_variant_dissector_tests.cpp)
    add_test(NAME unit.arp_variant_dissectors COMMAND arp_variant_dissector_tests)

    pruftnet_add_sniffing_test(phase5_dissector_tests tests/unit/phase5_dissector_tests.cpp)
    add_test(NAME unit.phase5_dissectors COMMAND phase5_dissector_tests)

    pruftnet_add_sniffing_test(replay_store_tests tests/unit/replay_store_tests.cpp)
    add_test(NAME unit.replay_store COMMAND replay_store_tests)

    pruftnet_add_sniffing_test(summary_extractor_tests tests/unit/summary_extractor_tests.cpp)
    add_test(NAME unit.summary_extractor COMMAND summary_extractor_tests)

    add_executable(packet_tree_fixture_writer tests/packet_tree_fixture_writer.cpp)
    target_include_directories(packet_tree_fixture_writer
        PRIVATE
            "${CMAKE_CURRENT_SOURCE_DIR}"
            "${CMAKE_CURRENT_SOURCE_DIR}/src"
    )
    target_link_libraries(packet_tree_fixture_writer PRIVATE pruftnet_sniffing)
    pruftnet_enable_warnings(packet_tree_fixture_writer)

    add_executable(parser_packet_tree_fixture_writer tests/parser_packet_tree_fixture_writer.cpp)
    target_include_directories(parser_packet_tree_fixture_writer
        PRIVATE
            "${CMAKE_CURRENT_SOURCE_DIR}"
            "${CMAKE_CURRENT_SOURCE_DIR}/src"
    )
    target_link_libraries(parser_packet_tree_fixture_writer PRIVATE pruftnet_sniffing)
    pruftnet_enable_warnings(parser_packet_tree_fixture_writer)

    pruftnet_add_sniffing_test(sniffer_options_tests tests/unit/sniffer_options_tests.cpp)
    add_test(NAME unit.sniffer_options COMMAND sniffer_options_tests)

    pruftnet_add_sniffing_test(sniffing_offline_pcap_tests tests/integration/sniffing_offline_pcap_tests.cpp)
    target_compile_definitions(sniffing_offline_pcap_tests
        PRIVATE
            PRUFTNET_TEST_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/tests/fixtures"
    )
    add_test(NAME integration.sniffing_offline_pcap COMMAND sniffing_offline_pcap_tests)

    pruftnet_add_sniffing_test(replay_pipeline_tests tests/integration/replay_pipeline_tests.cpp)
    target_include_directories(replay_pipeline_tests PRIVATE "${PACKET_TREE_GENERATED_DIR}" "${flatbuffers_SOURCE_DIR}/include")
    target_compile_definitions(replay_pipeline_tests PRIVATE PRUFTNET_TEST_FIXTURES_DIR="${CMAKE_CURRENT_SOURCE_DIR}/tests/fixtures")
    add_test(NAME integration.replay_pipeline COMMAND replay_pipeline_tests)

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

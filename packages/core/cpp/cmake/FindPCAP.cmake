find_path(PCAP_INCLUDE_DIR
    NAMES pcap/pcap.h pcap.h
)

find_library(PCAP_LIBRARY
    NAMES pcap wpcap
)

set(PCAP_EXTRA_LIBRARIES "")

if(WIN32)
    find_library(PCAP_PACKET_LIBRARY NAMES Packet)
    if(PCAP_PACKET_LIBRARY)
        list(APPEND PCAP_EXTRA_LIBRARIES "${PCAP_PACKET_LIBRARY}")
    endif()
    list(APPEND PCAP_EXTRA_LIBRARIES ws2_32)
endif()

include(FindPackageHandleStandardArgs)
find_package_handle_standard_args(PCAP REQUIRED_VARS PCAP_LIBRARY PCAP_INCLUDE_DIR)

if(PCAP_FOUND)
    set(PCAP_INCLUDE_DIRS "${PCAP_INCLUDE_DIR}")
    set(PCAP_LIBRARIES "${PCAP_LIBRARY}" ${PCAP_EXTRA_LIBRARIES})

    if(NOT TARGET PCAP::PCAP)
        add_library(PCAP::PCAP UNKNOWN IMPORTED)
        set_target_properties(PCAP::PCAP PROPERTIES
            IMPORTED_LOCATION "${PCAP_LIBRARY}"
            INTERFACE_INCLUDE_DIRECTORIES "${PCAP_INCLUDE_DIR}"
            INTERFACE_LINK_LIBRARIES "${PCAP_EXTRA_LIBRARIES}"
        )
    endif()
endif()

mark_as_advanced(PCAP_INCLUDE_DIR PCAP_LIBRARY PCAP_PACKET_LIBRARY)

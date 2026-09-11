#include "tools/capture_worker.hpp"

#ifdef _WIN32
#include <windows.h>
#include <cstdio>
#include <string>
#endif

int main(int argc, char **argv) {
#ifdef _WIN32
  wchar_t system_directory[MAX_PATH];
  const auto length = GetSystemDirectoryW(system_directory, MAX_PATH);
  if (length == 0 || length >= MAX_PATH) return 1;
  const auto npcap = std::wstring(system_directory) + L"\\Npcap";
  // Restrict dependency lookup to the installed driver and Windows system DLLs.
  SetDefaultDllDirectories(LOAD_LIBRARY_SEARCH_SYSTEM32 | LOAD_LIBRARY_SEARCH_USER_DIRS);
  if (!AddDllDirectory(npcap.c_str()) ||
      !LoadLibraryExW((npcap + L"\\wpcap.dll").c_str(), nullptr,
                     LOAD_LIBRARY_SEARCH_DLL_LOAD_DIR | LOAD_LIBRARY_SEARCH_SYSTEM32)) {
    std::fputs("Npcap is required. Install it from https://npcap.com/ and restart Pruftnet.\n", stderr);
    return 1;
  }
#endif
  return pruftnet::capture_worker::run(argc, argv);
}

{
  "targets": [
    {
      "target_name": "core",
      "sources": [
        "native/addon.cc",
        "native/modules/datetime/datetime.cc"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "native/include"
      ],
      "dependencies": [
        "<!@(node -p \"require('node-addon-api').gyp\")"
      ],
      "defines": [ "NAPI_CPP_EXCEPTIONS" ],
      "cflags_cc!": [ "-fno-exceptions" ],
      "cflags!": [ "-fno-exceptions" ],
      "conditions": [
        [ "OS=='win'", {
          "msvs_settings": {
            "VCCLCompilerTool": { "ExceptionHandling": 1, "AdditionalOptions": ["/std:c++17"] }
          }
        }, {
          "xcode_settings": { "GCC_ENABLE_CPP_EXCEPTIONS": "YES", "CLANG_CXX_LIBRARY": "libc++", "CLANG_CXX_LANGUAGE_STANDARD": "c++17" },
          "cflags_cc": ["-std=c++17"]
        }]
      ]
    }
  ]
}


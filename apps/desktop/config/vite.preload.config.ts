import { builtinModules } from "node:module"

import { defineConfig } from "vite"

const nodeBuiltins = builtinModules.flatMap((moduleName) => [moduleName, `node:${moduleName}`])

export default defineConfig({
  build: {
    lib: {
      entry: "src/preload.ts",
      formats: ["es"],
      fileName: "preload",
    },
    outDir: "dist-electron/preload",
    rollupOptions: {
      output: {
        entryFileNames: "preload.js",
      },
      external: ["electron", ...nodeBuiltins],
    },
    minify: false,
  },
})

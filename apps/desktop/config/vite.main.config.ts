import { builtinModules } from "node:module"

import { defineConfig } from "vite"

const nodeBuiltins = builtinModules.flatMap((moduleName) => [moduleName, `node:${moduleName}`])

export default defineConfig({
  build: {
    lib: {
      entry: "src/main.ts",
      formats: ["es"],
      fileName: "main",
    },
    outDir: "dist-electron/main",
    rollupOptions: {
      output: {
        entryFileNames: "main.js",
      },
      external: ["electron", ...nodeBuiltins],
    },
    minify: false,
  },
})

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
    outDir: ".vite/build",
    rollupOptions: {
      output: {
        entryFileNames: "main.js",
      },
      external: ["electron", "electron-squirrel-startup", ...nodeBuiltins],
    },
    minify: false,
  },
})

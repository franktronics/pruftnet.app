import { builtinModules } from "node:module"

import { defineConfig } from "vite"

const nodeBuiltins = builtinModules.flatMap((moduleName) => [moduleName, `node:${moduleName}`])

export default defineConfig({
  build: {
    ssr: "src/main.ts",
    target: "node22",
    outDir: "dist",
    emptyOutDir: true,
    sourcemap: true,
    minify: false,
    rollupOptions: {
      external: ["vite", ...nodeBuiltins],
      output: {
        entryFileNames: "main.js",
      },
    },
  },
  ssr: {
    noExternal: ["@repo/core", "@repo/shared"],
  },
})

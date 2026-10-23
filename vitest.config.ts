import path from "node:path"

import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname),
      // `server-only` lanza un error fuera de React Server Components; en los tests no aplica.
      "server-only": path.resolve(__dirname, "tests/vacio.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
  },
})

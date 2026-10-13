import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { createHash } from "node:crypto";

export default defineConfig({
  plugins: [react()],
  css: {
    modules: {
      // Keep names stable when CSS text changes during a lazy route's HMR update.
      generateScopedName: (name, filename) =>
        `napai_${name}_${createHash("sha256").update(filename).digest("hex").slice(0, 6)}`,
    },
  },
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: "react-vendor",
              test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/,
              priority: 20,
            },
            {
              name: "validation",
              test: /node_modules[\\/](ajv|ajv-formats|zod)[\\/]/,
              priority: 15,
            },
          ],
        },
      },
    },
  },
  server: { host: "localhost", port: 5173, strictPort: true },
});

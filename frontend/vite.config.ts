import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
  base: "./",
  resolve: {
    alias: [
      { find: "@math", replacement: path.resolve(__dirname, "../src") },
      { find: "node:crypto", replacement: path.resolve(__dirname, "src/shims/node-crypto.ts") },
    ],
  },
  build: {
    outDir: "dist",
    target: "es2020",
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          pixi: ["pixi.js"],
          gsap: ["gsap"],
        },
      },
    },
  },
  server: {
    port: 5173,
    host: "0.0.0.0",
  },
});

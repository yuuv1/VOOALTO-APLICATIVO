import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";

const isSingleFile = process.env.SINGLE_FILE === "1";

export default defineConfig({
  base: "./",
  plugins: isSingleFile ? [react(), tailwindcss(), viteSingleFile()] : [react(), tailwindcss()],
  build: {
    outDir: isSingleFile ? "./.singlefile-tmp" : "../docs",
    emptyOutDir: true,
    chunkSizeWarningLimit: 8000,
    copyPublicDir: !isSingleFile,
  },
  server: {
    host: "0.0.0.0",
    port: 5173,
    allowedHosts: true,
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8765",
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 4173,
    allowedHosts: true,
  },
});

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  root: "client",
  build: { outDir: "../dist", emptyOutDir: true },
  server: {
    host: "0.0.0.0",
    allowedHosts: [".e2b.app"],
    proxy: { "/api": "http://127.0.0.1:3001" },
  },
});

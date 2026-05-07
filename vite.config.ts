import path from "path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import tailwindcss from "@tailwindcss/vite";
import { cloudflare } from "@cloudflare/vite-plugin";

export default defineConfig({
  server: {
    host: "::",
    port: 8080,
  },
  plugins: [cloudflare(), react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    // Force a single React instance — prevents the "Invalid hook call" error
    // when lazy-loading @paper-design/shaders-react which can otherwise be
    // bundled with its own React copy.
    dedupe: ["react", "react-dom"],
  },
  optimizeDeps: {
    include: ["@paper-design/shaders-react"],
  },
  build: {},
});

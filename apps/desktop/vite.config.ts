import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "node:process";

const host = env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => ({
  plugins: [react(), tailwindcss()],
  // A hosted build must never silently open the disconnected browser journal.
  // This selects the setup screen until an authenticated data adapter exists;
  // access control itself must be enforced by Vercel before deployment.
  define: {
    "import.meta.env.VITE_PRIVATE_WEB": JSON.stringify(
      mode === "private-web" || env.VERCEL === "1" ? "true" : "false",
    ),
  },
  build: {
    outDir: mode === "private-web" ? "dist-private-web" : "dist",
    sourcemap: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(path.dirname(fileURLToPath(import.meta.url)), "./src"),
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 5174,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));

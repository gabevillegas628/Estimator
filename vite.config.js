import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // In dev, Vite serves the UI on 5173 and forwards API calls to the Express
    // process on 3001. In production Express serves both from one port, so
    // there is no proxy and the client's relative /api paths just work.
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});

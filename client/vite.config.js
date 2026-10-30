import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In development the React app runs on :5173 and forwards /api calls to the Express server on :5001.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:5001",
        changeOrigin: true,
      },
    },
  },
});

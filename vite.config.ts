import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  envPrefix: ["VITE_", "SUPABASE_"],
  plugins: [react()],
  server: {
    proxy: {
      // Contourne le CORS pour la recherche d'images Open Food Facts (dev only)
      "/off-search": {
        target: "https://search.openfoodfacts.org",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/off-search/, ""),
      },
    },
  },
});
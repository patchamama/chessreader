import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In dev the frontend calls the API with relative paths ("/api/..."), so we
// proxy those to the PHP backend. Override the target with VITE_API_TARGET.
const apiTarget = process.env.VITE_API_TARGET ?? 'http://127.0.0.1:8080'

// VITE_BASE_PATH lets the GitHub Pages deploy set the repo sub-path,
// e.g. /chessreader/ for https://patchamama.github.io/chessreader/
const basePath = process.env.VITE_BASE_PATH ?? '/'

export default defineConfig({
  base: basePath,
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true,
      },
    },
  },
})

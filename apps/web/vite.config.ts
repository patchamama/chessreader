import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// In dev the frontend calls the API with relative paths ("/api/..."), so we
// proxy those to the PHP backend. Override the target with VITE_API_TARGET.
const apiTarget = process.env.VITE_API_TARGET ?? 'http://127.0.0.1:8080'

export default defineConfig({
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

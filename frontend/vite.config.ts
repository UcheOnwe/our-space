import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Forwards API calls to the Django dev server so the browser sees
      // frontend and backend as the same origin. This sidesteps CORS
      // entirely and keeps the session/CSRF cookies same-origin, which is
      // simpler than configuring django-cors-headers for local development.
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      },
      // Same reasoning as /api above, extended to WebSockets: the browser
      // connects to ws://localhost:5173/ws/presence/, and Vite tunnels it
      // to the real Django/Daphne backend. `ws: true` tells Vite's proxy to
      // handle the HTTP-Upgrade handshake, not just plain HTTP requests.
      '/ws': {
        target: 'ws://localhost:8000',
        ws: true,
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})

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
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
})

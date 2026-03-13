import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  base: '/static/voter/',
  build: {
    outDir: '../static/voter',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
      '/join': 'http://localhost:8000',
      '/identify': 'http://localhost:8000',
    },
  },
})

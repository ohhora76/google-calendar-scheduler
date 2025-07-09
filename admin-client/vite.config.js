import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/admin/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
      '/auth': 'http://localhost:3000',
      '/logout': 'http://localhost:3000',
      '/admin/api': 'http://localhost:3000',
      '/admin/calendar': 'http://localhost:3000',
      '/admin/delete-account': 'http://localhost:3000',
      '/admin/login': 'http://localhost:3000',
    }
  }
})
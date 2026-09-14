import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // Bind to all network interfaces so the dev server is reachable from
    // other devices on the same LAN (e.g. your laptop).
    host: true,
  },
})

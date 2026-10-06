import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.VITE_BASE || '/', // GitHub Pages serves from /ryoma_3d/
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: true,
    headers: { 'Cache-Control': 'no-store' },
  },
  preview: { host: '0.0.0.0', port: 4173, allowedHosts: true },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});

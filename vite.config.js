import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
    // e2b のプレビュー（https://{port}-{id}.e2b.app）からのアクセスを許可する
    allowedHosts: true,
    cors: true,
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: true,
  },
  build: {
    target: 'es2020',
    chunkSizeWarningLimit: 1600,
  },
});

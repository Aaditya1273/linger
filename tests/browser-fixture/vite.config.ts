import { defineConfig } from 'vite';

export default defineConfig({
  define: {
    'process.env': {},
  },
  esbuild: {
    jsx: 'automatic',
  },
});

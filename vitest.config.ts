import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Time labels render in the viewer's timezone; pin one so assertions are
// deterministic on any machine (CI included).
process.env.TZ = 'Asia/Shanghai';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/test/setup.ts',
    exclude: ['**/node_modules/**', '**/dist/**', '.worktrees/**', 'tests/**'],
  },
});

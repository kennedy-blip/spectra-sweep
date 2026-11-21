import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    css: false,
    restoreMocks: true,
    // Module switches run a framer layout exit; these are interaction tests, not
    // microbenchmarks.
    testTimeout: 25000,
    hookTimeout: 20000,
  },
});

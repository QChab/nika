import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';

export default defineConfig({
  plugins: [
    swc.vite({
      module: { type: 'es6' },
    }),
  ],
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e.spec.ts'],
    setupFiles: ['./test/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    fileParallelism: false,
  },
});

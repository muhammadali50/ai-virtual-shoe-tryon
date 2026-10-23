import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  server: { watch: { ignored: ['**/model-check-dist/**'] } },
  build: mode === 'model-check' ? {
    outDir: 'model-check-dist',
    rolldownOptions: { input: 'tests/model-smoke.html' },
  } : {},
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    restoreMocks: true,
  },
}))

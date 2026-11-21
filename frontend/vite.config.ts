import { fileURLToPath } from 'node:url'
import { searchForWorkspaceRoot } from 'vite'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { logoFormalCatalog } from './vite/logoFormalCatalog.ts'

const frontendRoot = fileURLToPath(new URL('.', import.meta.url))
const repoRoot = fileURLToPath(new URL('..', import.meta.url))

export default defineConfig(({ mode }) => ({
  plugins: [react(), logoFormalCatalog(repoRoot)],
  server: {
    watch: { ignored: ['**/model-check-dist/**'] },
    // The dev server may read the catalog photos outside frontend/, and nothing else there.
    fs: { allow: [searchForWorkspaceRoot(frontendRoot), fileURLToPath(new URL('../data/logo-formal/images', import.meta.url))] },
  },
  build: mode === 'model-check' ? {
    outDir: 'model-check-dist',
    rolldownOptions: { input: 'tests/model-smoke.html' },
  } : {
    // Catalog at /, existing camera prototype at /scan/.
    rolldownOptions: { input: { catalog: `${frontendRoot}index.html`, scan: `${frontendRoot}scan/index.html` } },
    // The three.js 3D viewer (~645 kB, ~160 kB gzip) is a lazy chunk loaded only when a 3D slide opens.
    chunkSizeWarningLimit: 700,
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    restoreMocks: true,
  },
}))

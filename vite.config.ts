import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import {readFileSync} from 'node:fs';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(({ command }) => {
  const projectRoot = import.meta.dirname;
  const demoSeedModule = path.resolve(projectRoot, 'src/data/seedData.ts');
  const productionSeedModule = path.resolve(projectRoot, 'src/data/productionSeedData.ts');
  const excludeDemoSeedData = {
    name: 'exclude-demo-seed-data-from-production',
    enforce: 'pre' as const,
    load(id: string) {
      if (command === 'build' && id === demoSeedModule) {
        return readFileSync(productionSeedModule, 'utf8');
      }
      return null;
    },
  };

  return {
    plugins: [react(), tailwindcss(), excludeDemoSeedData],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

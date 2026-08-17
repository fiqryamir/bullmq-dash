import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { 'demo-seed': 'src/demoSeed.ts' },
  format: ['esm'],
  clean: false,
  sourcemap: false,
  platform: 'node',
  target: 'node20',
});

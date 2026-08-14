import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { bin: 'src/bin.ts' },
  format: ['esm'],
  clean: false,
  sourcemap: false,
  platform: 'node',
  target: 'node20',
  banner: { js: '#!/usr/bin/env node' },
});

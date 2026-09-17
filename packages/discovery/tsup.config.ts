import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node24',
  treeshake: true,
  external: ['@understudy/model-provider', '@understudy/schemas', '@understudy/surface'],
});

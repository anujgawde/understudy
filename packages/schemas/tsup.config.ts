import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node24',
  treeshake: true,
  // zod stays external so the whole workspace shares one instance: `instanceof
  // z.ZodError` and issue formatting must work across package seams.
  external: ['zod'],
});

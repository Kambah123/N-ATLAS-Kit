import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  splitting: false,
  minify: false,
  // Node 18 is the floor; the same output has to run in browsers and on edge
  // runtimes, so we target the language level rather than a specific platform
  // and never reach for a Node built-in in the core paths.
  target: 'es2022',
  platform: 'neutral',
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.js' };
  },
});

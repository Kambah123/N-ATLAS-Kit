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
  // Node 20 is the floor (Node 18 is EOL, and global File is not available
  // there). The same output has to run in browsers and on edge runtimes, so
  // we target the language level rather than a specific platform and never
  // reach for a Node built-in in the core paths.
  target: 'es2022',
  platform: 'neutral',
  // File paths are read with a dynamic import so browsers never bundle Node.
  external: ['node:fs/promises', 'node:path'],
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.js' };
  },
});

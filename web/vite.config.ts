import { resolve } from 'node:path';
import preact from '@preact/preset-vite';

import { defineConfig } from 'vite';

const root = resolve(import.meta.dirname, '.');

export default defineConfig({
  plugins: [preact()],
  root,
  // The crawler's output is the site's static data - serve it directly rather
  // than copying it around. data/listings.json is served at /listings.json.
  publicDir: resolve(root, '../data'),
  // GitHub Pages project site lives at /<repo>/.
  base: process.env.PAGES_BASE ?? '/Test/',
  build: { outDir: resolve(root, '../dist'), emptyOutDir: true },
});

import { resolve } from 'node:path';
import preact from '@preact/preset-vite';

import { defineConfig, type Plugin } from 'vite';

import { buildVocab } from './vocab.ts';

const root = resolve(import.meta.dirname, '.');

// Serves the build-time vocabulary (brands, models, tag synonyms, phrases -
// derived from crawler/src/taxonomy.yml) as a plain JSON module, so the
// runtime bundle never has to ship the `yaml` parser or read the YAML file
// itself. Consumed as `import vocab from 'virtual:vocab'`.
const VIRTUAL_VOCAB_ID = 'virtual:vocab';
const RESOLVED_VIRTUAL_VOCAB_ID = `\0${VIRTUAL_VOCAB_ID}`;

function vocabPlugin(): Plugin {
  return {
    name: 'stone-and-weave:vocab',
    resolveId(id) {
      if (id === VIRTUAL_VOCAB_ID) return RESOLVED_VIRTUAL_VOCAB_ID;
      return null;
    },
    load(id) {
      if (id === RESOLVED_VIRTUAL_VOCAB_ID) {
        return `export default ${JSON.stringify(buildVocab())};`;
      }
      return null;
    },
  };
}

export default defineConfig({
  plugins: [preact(), vocabPlugin()],
  root,
  // The crawler's output is the site's static data - serve it directly rather
  // than copying it around. data/listings.json is served at /listings.json.
  publicDir: resolve(root, '../data'),
  // GitHub Pages project site lives at /<repo>/.
  base: process.env.PAGES_BASE ?? '/Test/',
  build: { outDir: resolve(root, '../dist'), emptyOutDir: true },
});

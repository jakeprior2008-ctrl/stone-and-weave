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
        const vocab = buildVocab();
        // The query parser (web/src/parse.ts) already treats a tag's own
        // label and id as implicit candidates, so a synonym that just
        // repeats one of those adds nothing but bytes to every visitor's
        // download. Trimmed here, at the boundary into the shipped bundle,
        // rather than in buildVocab() itself, so its own return value (and
        // the tests against it) are unaffected.
        // `group` is filter-rail grouping - the query parser never reads it
        // (the rail gets its own grouping from taxonomy.json), so it is
        // dropped from the shipped payload too. buildVocab()'s own return
        // value (and the Vocab type) still carries it for whoever else needs it.
        const naiveLabel = (tag: string) => tag.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
        const shipped = {
          ...vocab,
          tags: vocab.tags.map(({ group: _group, ...t }) => ({
            ...t,
            // A label that's just the mechanical title-case of the id (e.g.
            // "onyx" -> "Onyx") is dropped; web/src/parse.ts reconstructs it
            // the same way when it finds one missing.
            label: t.label === naiveLabel(t.tag) ? undefined : t.label,
            synonyms: t.synonyms.filter(
              (s) => s !== t.label.toLowerCase() && s !== t.tag.replace(/-/g, ' '),
            ),
          })),
        };
        return `export default ${JSON.stringify(shipped)};`;
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
  // terser over esbuild's default minifier: the shipped vocabulary (see
  // vocabPlugin above) is pure data, and terser's extra compaction passes
  // buy back real gzip bytes on data-heavy bundles like this one.
  build: {
    outDir: resolve(root, '../dist'),
    emptyOutDir: true,
    minify: 'terser',
    terserOptions: {
      compress: { passes: 3, unsafe: true },
      mangle: { toplevel: true },
      format: { comments: false },
    },
  },
});

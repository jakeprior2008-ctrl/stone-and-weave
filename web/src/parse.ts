// Turns a natural-language search box query into filter state, deterministically
// and entirely offline. Nothing here is regex-catastrophic: the input is capped
// at 200 characters and every pattern is a bounded, anchored alternation over a
// short, fixed vocabulary - there is no exponential backtracking surface.
import type { Filters } from './filters.ts';
import type { Vocab } from '../vocab.ts';

export type Understood = {
  text: string;
  kind: 'tags' | 'brand' | 'price' | 'era' | 'case' | 'grail' | 'oddity' | 'noop';
  label: string;
  patch: Partial<Filters>;
};

export type Parsed = {
  patch: Partial<Filters>;
  understood: Understood[];
  leftover: string;
};

// Deliberately a superset of the brief's list: "but" is a filler conjunction
// exactly like "and", and dropping it is needed to get "something like a
// Piaget Ellipse but cheaper" down to the leftover "cheaper" the product
// owner asked for, rather than "but cheaper".
const STOPWORDS = new Set([
  'a', 'an', 'the', 'with', 'and', 'but', 'something', 'like', 'watch', 'watches',
  'please', 'for', 'me', 'i', 'want', 'in', 'of',
]);

const MAX_LEN = 200;

const fmtGBP = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;

const titleCase = (hit: string) => hit.replace(/\b\w/g, (c) => c.toUpperCase());

// A tag whose label is just the mechanical title-case of its id (e.g. "onyx"
// -> "Onyx") never has that label shipped in virtual:vocab (see vite.config.ts) -
// it costs bytes for no new information. This reconstructs it on demand.
const naiveLabel = (tag: string) => titleCase(tag.replace(/-/g, ' '));

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function parseNum(raw: string): number {
  let s = raw.trim().toLowerCase().replace(/[£$€,\s]/g, '');
  let mult = 1;
  if (s.endsWith('k')) {
    mult = 1000;
    s = s.slice(0, -1);
  }
  const n = Number.parseFloat(s);
  return Math.round(n * mult);
}

type Match = { start: number; end: number; item: Understood };

function normalise(q: string): string {
  let s = q.slice(0, MAX_LEN).toLowerCase();
  // Keep letters, digits, whitespace and the punctuation prices/words need;
  // everything else (quotes, emoji, stray punctuation) becomes a space so it
  // can never glue two otherwise-separate tokens together.
  s = s.replace(/[^a-z0-9£$€.,'\-<>\s]/g, ' ');
  s = s.replace(/[ \t]+/g, ' ');
  return s;
}

const blank = (s: string, start: number, end: number) => s.slice(0, start) + ' '.repeat(end - start) + s.slice(end);

/** Runs a `\b<pattern>\b` global match over `s`. Whenever `onMatch` returns
 *  true (it "claims" the match), that span is blanked immediately - so a
 *  later, shorter pattern never re-matches inside an already-claimed word -
 *  and the scan restarts on the blanked copy; a false leaves the text alone
 *  and scanning continues past it. Shared by every word/phrase-scanning
 *  stage below. Returns the (possibly blanked) string. */
function scanAll(s: string, pattern: string, onMatch: (m: RegExpExecArray) => boolean | void): string {
  const re = new RegExp(String.raw`\b${pattern}\b`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    if (onMatch(m) !== false) {
      s = blank(s, m.index, m.index + m[0].length);
      re.lastIndex = 0; // the string mutated underneath us; restart the scan on the blanked copy
    }
  }
  return s;
}

// ---------------------------------------------------------------- price

const NUM = String.raw`(?:[£$€]\s?)?\d[\d,]*(?:\.\d+)?\s?k?`;

type PriceRule = { re: RegExp; apply: (m: RegExpExecArray) => { patch: Partial<Filters>; label: string } };

const range = (min: number, max: number) => ({
  patch: { minPrice: min, maxPrice: max },
  label: `${fmtGBP(min)}–${fmtGBP(max)}`,
});
const under = (n: number) => ({ patch: { maxPrice: n }, label: `under ${fmtGBP(n)}` });
const over = (n: number) => ({ patch: { minPrice: n }, label: `over ${fmtGBP(n)}` });

const RANGE_RULES: PriceRule[] = [
  { re: new RegExp(String.raw`\bbetween\s+(${NUM})\s+and\s+(${NUM})\b`, 'i'), apply: (m) => range(parseNum(m[1]), parseNum(m[2])) },
  { re: new RegExp(String.raw`\b(${NUM})\s+to\s+(${NUM})\b`, 'i'), apply: (m) => range(parseNum(m[1]), parseNum(m[2])) },
  { re: new RegExp(String.raw`\b(${NUM})\s?-\s?(${NUM})\b`), apply: (m) => range(parseNum(m[1]), parseNum(m[2])) },
];

const DIRECTIONAL_RULES: PriceRule[] = [
  { re: new RegExp(String.raw`\b(?:under|below|less than|no more than|up to|max(?:imum)?)\s+(${NUM})\b`, 'i'), apply: (m) => under(parseNum(m[1])) },
  { re: new RegExp(String.raw`<\s?(${NUM})`), apply: (m) => under(parseNum(m[1])) },
  { re: new RegExp(String.raw`\b(?:over|above|from|min(?:imum)?|at least|more than)\s+(${NUM})\b`, 'i'), apply: (m) => over(parseNum(m[1])) },
  { re: new RegExp(String.raw`>\s?(${NUM})`), apply: (m) => over(parseNum(m[1])) },
  { re: new RegExp(String.raw`[£$€]\s?\d[\d,]*(?:\.\d+)?\s?k?`, 'i'), apply: (m) => under(parseNum(m[0])) },
  { re: /\bcheap\b/i, apply: () => under(2000) },
  { re: /\bexpensive\b/i, apply: () => over(10000) },
];

function extractPrice(s: string, matches: Match[]): { s: string; patch: Partial<Filters> } {
  const patch: Partial<Filters> = {};

  const take = (rules: PriceRule[]): boolean => {
    for (const { re, apply } of rules) {
      const m = re.exec(s);
      if (!m) continue;
      const { patch: p, label } = apply(m);
      Object.assign(patch, p);
      matches.push({
        start: m.index,
        end: m.index + m[0].length,
        item: { text: m[0].trim(), kind: 'price', label, patch: p },
      });
      s = blank(s, m.index, m.index + m[0].length);
      return true;
    }
    return false;
  };

  if (!take(RANGE_RULES)) take(DIRECTIONAL_RULES);

  return { s, patch };
}

// ------------------------------------------------------------------ era

const DECADE_WORDS: Record<string, string> = {
  twenties: '1920s', thirties: '1930s', forties: '1940s', fifties: '1950s',
  sixties: '1960s', seventies: '1970s', eighties: '1980s', nineties: '1990s',
};

function extractEra(s: string, matches: Match[]): { s: string; patch: Partial<Filters> } {
  const eras: string[] = [];

  const take = (re: RegExp, toEra: (m: RegExpExecArray) => string) => {
    const m = re.exec(s);
    if (!m) return;
    const era = toEra(m);
    if (!eras.includes(era)) eras.push(era);
    matches.push({
      start: m.index,
      end: m.index + m[0].length,
      item: { text: m[0].trim(), kind: 'era', label: era, patch: { eras: [era] } },
    });
    s = blank(s, m.index, m.index + m[0].length);
  };

  take(/\b(19[2-9]0)s\b/, (m) => `${m[1]}s`);
  take(/\B'([2-9]0)s\b/, (m) => `19${m[1]}s`);
  take(/\b([2-9]0)s\b/, (m) => `19${m[1]}s`);
  for (const word of Object.keys(DECADE_WORDS)) {
    take(new RegExp(String.raw`\b${word}\b`, 'i'), () => DECADE_WORDS[word]);
  }

  const vm = /\bvintage\b/i.exec(s);
  if (vm) {
    matches.push({
      start: vm.index,
      end: vm.index + vm[0].length,
      item: { text: vm[0], kind: 'noop', label: 'vintage: everything here is', patch: {} },
    });
    s = blank(s, vm.index, vm.index + vm[0].length);
  }

  return { s, patch: eras.length ? { eras } : {} };
}

// ----------------------------------------------------------------- case

function extractCase(s: string, matches: Match[]): { s: string; patch: Partial<Filters> } {
  let patch: Partial<Filters> = {};

  const take = (re: RegExp, apply: (m: RegExpExecArray) => { patch: Partial<Filters>; label: string } | null) => {
    const m = re.exec(s);
    if (!m) return false;
    const result = apply(m);
    if (!result) return false;
    patch = { ...patch, ...result.patch };
    matches.push({
      start: m.index,
      end: m.index + m[0].length,
      item: { text: m[0].trim(), kind: 'case', label: result.label, patch: result.patch },
    });
    s = blank(s, m.index, m.index + m[0].length);
    return true;
  };

  take(/\b(\d{2}(?:\.\d)?)\s?mm\b/, (m) => {
    const n = Number.parseFloat(m[1]);
    if (n < 18 || n > 50) return null;
    return { patch: { minCase: n - 1, maxCase: n + 1 }, label: `${m[1]}mm` };
  }) ||
    take(/\b(small|petite|tiny)\b/i, () => ({ patch: { maxCase: 32 }, label: 'small (≤32mm)' })) ||
    take(/\b(large|big|jumbo|oversized)\b/i, () => ({ patch: { minCase: 38 }, label: 'large (≥38mm)' })) ||
    take(/\b(midsize|mid-size)\b/i, () => ({ patch: { minCase: 33, maxCase: 37 }, label: 'midsize (33–37mm)' }));

  return { s, patch };
}

// ------------------------------------------------------ grail & oddity

function extractGrailOddity(s: string, matches: Match[]): { s: string; patch: Partial<Filters> } {
  const patch: Partial<Filters> = {};

  s = scanAll(s, '(holy grail|grails|grail)', (m) => {
    patch.grailsOnly = true;
    matches.push({
      start: m.index,
      end: m.index + m[0].length,
      item: { text: m[0], kind: 'grail', label: 'grails only', patch: { grailsOnly: true } },
    });
  });

  s = scanAll(s, '(weird|strange|odd|unusual|oddball)', (m) => {
    patch.minOddity = 60;
    matches.push({
      start: m.index,
      end: m.index + m[0].length,
      item: { text: m[0], kind: 'oddity', label: `${m[0].toLowerCase()} (oddity 60+)`, patch: { minOddity: 60 } },
    });
  });

  return { s, patch };
}

// -------------------------------------------------------- tags & brand

type Candidate = { pattern: string; words: number; group: string[] };

function makeCandidateAdder(cands: Candidate[], seen: Set<string>) {
  return (pattern: string, group: string[]) => {
    const p = pattern.trim().toLowerCase();
    if (!p) return;
    const key = `${p}|${[...group].sort().join(',')}`;
    if (seen.has(key)) return;
    seen.add(key);
    cands.push({ pattern: p, words: p.split(/\s+/).length, group: [...group] });
  };
}

const byLongest = (a: Candidate, b: Candidate) => b.words - a.words || b.pattern.length - a.pattern.length;

// A multi-word natural phrase (e.g. "green stone") is checked, and consumed,
// before any single tag's own label/id/synonyms - even when a tag's synonym
// is textually longer (malachite's synonym "green stone dial" would
// otherwise out-rank the "green stone" phrase on raw length and swallow the
// word "dial" along with it, collapsing the phrase's whole OR group down to
// just malachite). Phrases are the more general reading and win first.
function buildPhraseCandidates(vocab: Vocab): Candidate[] {
  const cands: Candidate[] = [];
  const add = makeCandidateAdder(cands, new Set());
  for (const [phrase, tags] of Object.entries(vocab.phrases)) add(phrase, tags);
  cands.sort(byLongest);
  return cands;
}

function buildTagCandidates(vocab: Vocab): Candidate[] {
  const cands: Candidate[] = [];
  const add = makeCandidateAdder(cands, new Set());
  for (const t of vocab.tags) {
    add(t.label ?? naiveLabel(t.tag), [t.tag]);
    add(t.tag.replace(/-/g, ' '), [t.tag]);
    for (const syn of t.synonyms) add(syn, [t.tag]);
  }
  cands.sort(byLongest);
  return cands;
}

type BrandCandidate = { pattern: string; words: number; canonical: string };

function buildBrandCandidates(vocab: Vocab): BrandCandidate[] {
  const cands: BrandCandidate[] = [];
  const seen = new Set<string>();
  const add = (pattern: string, canonical: string) => {
    const p = pattern.trim().toLowerCase();
    if (!p || seen.has(p)) return;
    seen.add(p);
    cands.push({ pattern: p, words: p.split(/\s+/).length, canonical });
  };
  for (const b of vocab.brands) {
    add(b, titleCase(b));
    if (b.includes('-')) add(b.replace(/-/g, ' '), titleCase(b));
  }
  for (const [model, brand] of Object.entries(vocab.models)) {
    add(model, brand);
    if (model.includes('-')) add(model.replace(/-/g, ' '), brand);
  }
  cands.sort((a, b) => b.words - a.words || b.pattern.length - a.pattern.length);
  return cands;
}

function extractTags(s: string, vocab: Vocab, matches: Match[]): { s: string; patch: Partial<Filters> } {
  const groups: string[][] = [];
  const groupKeys = new Set<string>();

  const addGroup = (group: string[], text: string, start: number, end: number, humanLabel: string) => {
    const key = [...group].sort().join(',');
    if (groupKeys.has(key)) return;
    groupKeys.add(key);
    groups.push(group);
    matches.push({
      start,
      end,
      item: { text, kind: 'tags', label: humanLabel, patch: { anyTags: [group] } },
    });
  };

  const labelFor = (pattern: string, group: string[]): string => {
    if (group.length > 1) {
      const labels = group.map((tag) => (vocab.tags.find((t) => t.tag === tag)?.label ?? naiveLabel(tag)).toLowerCase());
      return `${pattern} → ${labels.join(', ')}`;
    }
    const label = vocab.tags.find((t) => t.tag === group[0])?.label ?? naiveLabel(group[0]);
    return label;
  };

  const scan = (cands: Candidate[]) => {
    for (const c of cands) {
      s = scanAll(s, escapeRe(c.pattern), (m) =>
        addGroup(c.group, m[0], m.index, m.index + m[0].length, labelFor(c.pattern, c.group)),
      );
    }
  };

  // Phrases first (see buildPhraseCandidates), then individual tags on the remainder.
  scan(buildPhraseCandidates(vocab));
  const cands = buildTagCandidates(vocab);
  scan(cands);

  // Plural fallback: a lone token that matched nothing gets one retry with a
  // trailing 's' stripped, against single-word tag candidates only.
  const singleWord = cands.filter((c) => c.words === 1);
  s = scanAll(s, "[a-z][a-z'-]*", (m) => {
    const token = m[0];
    if (STOPWORDS.has(token) || !token.endsWith('s') || token.length < 2) return false;
    const singular = token.slice(0, -1);
    const hit = singleWord.find((c) => c.pattern === singular);
    if (!hit) return false;
    addGroup(hit.group, token, m.index, m.index + token.length, labelFor(singular, hit.group));
    return true;
  });

  return { s, patch: groups.length ? { anyTags: groups } : {} };
}

function extractBrand(base: string, vocab: Vocab, matches: Match[]): Partial<Filters> {
  const cands = buildBrandCandidates(vocab);
  const brands: string[] = [];
  let s = base;

  for (const c of cands) {
    s = scanAll(s, escapeRe(c.pattern), (m) => {
      // The filter value is deduplicated, but every recognised span is still
      // recorded so a second mention (e.g. a model name for a brand already
      // found by name) is removed from the leftover text, even though it
      // doesn't need a second chip's worth of new information.
      if (!brands.includes(c.canonical)) brands.push(c.canonical);
      matches.push({
        start: m.index,
        end: m.index + m[0].length,
        item: { text: m[0], kind: 'brand', label: c.canonical, patch: { brands: [c.canonical] } },
      });
    });
  }

  return brands.length ? { brands } : {};
}

// ------------------------------------------------------------------ main

export function parse(q: string, vocab: Vocab): Parsed {
  const matches: Match[] = [];
  let patch: Partial<Filters> = {};

  const norm = normalise(q ?? '');

  const priceR = extractPrice(norm, matches);
  Object.assign(patch, priceR.patch);

  const eraR = extractEra(priceR.s, matches);
  Object.assign(patch, eraR.patch);

  const caseR = extractCase(eraR.s, matches);
  Object.assign(patch, caseR.patch);

  const goR = extractGrailOddity(caseR.s, matches);
  Object.assign(patch, goR.patch);

  // `base` is the text left after price/era/case/grail/oddity have claimed
  // their words - both tag and brand detection scan it independently so a
  // model name that is also a tag (e.g. a future "ellipse" model) can yield
  // both a tag group and a brand, as intended.
  const base = goR.s;

  const tagR = extractTags(base, vocab, matches);
  if (tagR.patch.anyTags) patch.anyTags = tagR.patch.anyTags;

  const brandPatch = extractBrand(base, vocab, matches);
  if (brandPatch.brands) patch.brands = brandPatch.brands;

  // Leftover: `base` with every recognised span (tags ∪ brand) blanked out too.
  let leftoverSource = base;
  for (const m of matches) {
    if (m.start >= 0 && m.end <= leftoverSource.length) {
      // Only tag/brand matches live purely within `base`'s coordinate space
      // (price/era/case/grail/oddity already removed themselves from it).
      leftoverSource = blank(leftoverSource, m.start, m.end);
    }
  }
  const leftover = leftoverSource
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .filter((w) => !STOPWORDS.has(w))
    .join(' ');

  matches.sort((a, b) => a.start - b.start);
  const understood = matches.map((m) => m.item);

  return { patch, understood, leftover };
}

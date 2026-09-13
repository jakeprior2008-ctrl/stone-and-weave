import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import type { Tag } from './types.ts';

type RuleSpec = {
  tag: string;
  label: string;
  group: string;
  rarity: number;
  any: string[];
  /** Match the title only - see the note in tagsFor. */
  titleOnly?: boolean;
};
type TaxonomySpec = {
  grails: string[];
  families: Record<string, string[]>;
  groups: Record<string, string>;
  rules: RuleSpec[];
};

const spec: TaxonomySpec = parse(
  readFileSync(fileURLToPath(new URL('./taxonomy.yml', import.meta.url)), 'utf8'),
);

const compiled = spec.rules.map((r) => ({
  ...r,
  patterns: r.any.map((p) => new RegExp(p, 'i')),
}));

export const GROUPS = spec.groups;
export const GRAILS = new Set(spec.grails);
export const ALL_TAGS: Tag[] = spec.rules.map(({ tag, label, group, rarity }) => ({
  tag,
  label,
  group,
  rarity,
}));

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/&[a-z]+;/gi, ' ');

/**
 * Slug words carry real signal on pages with thin copy, but dealers recycle
 * URLs: Doble had a birch-wood dial still sitting on a "...malachite..." slug,
 * which tagged it as a malachite grail. So the slug is only consulted when the
 * description is too sparse to stand on its own.
 */
export function searchableText(title: string, description: string, url: string): string {
  const body = stripHtml(description);
  const slug = body.trim().length >= 60 ? '' : (url.split('/').pop()?.replace(/-/g, ' ') ?? '');
  return `${title} ${body} ${slug}`.replace(/\s+/g, ' ').trim();
}

const STONE_TAGS = spec.families?.stone ?? [];

/**
 * Dealers stock plenty that is not a watch: cufflinks, earrings, lighters,
 * desk clocks, paperweights, reference books. A third of one crawl was this,
 * and lapis cufflinks were scoring as grails.
 *
 * Two tiers, because the words behave differently:
 *
 * 1. Objects that are never a watch, whatever else the title says. A Rolex
 *    reference book names half the catalogue, so model names cannot rescue it.
 * 2. Jewellery *forms*, which are fine when the piece also tells the time. A
 *    pendant watch, brooch watch or sautoir timepiece is squarely on-taste; a
 *    pendant that is only a pendant is not.
 */
const HARD_OBJECT =
  /\b(cuff ?links?|cufflinks?|earrings?|ear ?clips?|tie ?(?:clip|bar|pin)s?|money ?clip|lighters?|pill ?box|cigarette case|key ?ring|keychain|fountain pen|ballpoint|paperweight|letter opener|desk clock|table clock|wall clock|mantel clock|corkscrew|bottle opener|shoe ?horn|figurine|objet|books?|magazines?|catalogues?|encyclopedia|posters?|watch roll|watch winder|watch box|storage case|gift card|spring bars?|polishing cloth|loupe|strap only|bracelet only)\b/i;

/** Jewellery forms - only disqualifying when nothing says it tells the time. */
const JEWELLERY =
  /\b(rings?|bangles?|necklaces?|pendants?|brooch(?:es)?|sautoir|choker|charms?|bracelets?|bands?)\b/i;

/** Any sign the thing is a watch, model names included. */
const TELLS_TIME =
  /\b(watch|watches|wristwatch|timepiece|chronograph|chronometre|chronometer|montre|calibre|caliber|automatic|manual wind|hand wind|jump hour|moonphase|reloj|orologio|datejust|day-?date|seamaster|speedmaster|constellation|oyster ?(?:perpetual|quartz)|cellini|ellipse|polo|santos|tank|reverso|royal oak|nautilus)\b/i;

export function looksLikeAccessory(title: string): boolean {
  if (HARD_OBJECT.test(title)) return true;
  return JEWELLERY.test(title) && !TELLS_TIME.test(title);
}

/**
 * Some claims cannot be read from sales copy. Dealer prose is full of "a unique
 * piece of history" and "issued to celebrate", which tagged 291 ordinary
 * watches as prototypes and 366 as military issue. Rules marked titleOnly are
 * matched against the title alone, where a dealer states what a watch IS
 * rather than how it makes you feel. Materials stay full-text, because a
 * malachite dial is often only mentioned in the description.
 */
export function tagsFor(text: string, title?: string): string[] {
  const found: string[] = [];
  for (const rule of compiled) {
    const haystack = rule.titleOnly ? (title ?? text) : text;
    if (rule.patterns.some((p) => p.test(haystack))) found.push(rule.tag);
  }
  return withStoneRules(found, title);
}

/**
 * Dealers list the other stones they can supply ("also in lapis, aventurine"),
 * which sprayed three stone tags onto a plainly-titled Onyx Datejust. When the
 * title names the stone, it wins outright; when only the body does and it names
 * three or more, that is a catalogue rather than a description, so none stick.
 */
function withStoneRules(found: string[], title?: string): string[] {
  const specific = STONE_TAGS.filter((t) => t !== 'stone-dial');
  let stones = found.filter((t) => specific.includes(t));
  let out = found;

  if (stones.length > 0) {
    const fromTitle = title ? stones.filter((t) => tagsForRaw(title).includes(t)) : [];
    if (fromTitle.length > 0) stones = fromTitle;
    else if (stones.length >= 3) stones = [];
    out = found.filter((t) => !specific.includes(t) || stones.includes(t));
  }

  // A specific stone implies the parent tag, so a filter on "stone dial"
  // catches a malachite that never says the words.
  if (stones.length > 0 && !out.includes('stone-dial')) out.push('stone-dial');
  return out;
}

/** Raw rule match with no stone post-processing - used to test the title alone. */
function tagsForRaw(text: string): string[] {
  return compiled.filter((r) => r.patterns.some((p) => p.test(text))).map((r) => r.tag);
}

const RARITY = new Map(spec.rules.map((r) => [r.tag, r.rarity]));

/** tag -> family id, for tags that belong to one. */
const FAMILY = new Map<string, string>();
for (const [family, tags] of Object.entries(spec.families ?? {})) {
  for (const t of tags) FAMILY.set(t, family);
}

/**
 * Collapse each family to its rarest member. A lapis dial is one feature, not
 * two, even though it carries both `lapis-lazuli` and the implied `stone-dial`.
 */
function scoringTags(tags: string[]): string[] {
  const best = new Map<string, string>();
  const loose: string[] = [];
  for (const t of tags) {
    const fam = FAMILY.get(t);
    if (!fam) {
      loose.push(t);
      continue;
    }
    const current = best.get(fam);
    if (!current || (RARITY.get(t) ?? 0) > (RARITY.get(current) ?? 0)) best.set(fam, t);
  }
  return [...loose, ...best.values()];
}

/**
 * 0-100. Rewards rare tags and combinations of them; a grail floors the score
 * at 85 so it can never be buried behind a merely unusual piece.
 */
export function oddityScore(tags: string[], brandKnown: boolean): number {
  if (tags.length === 0) return brandKnown ? 5 : 12;

  const scored = scoringTags(tags);
  const rarities = scored.map((t) => RARITY.get(t) ?? 0).sort((a, b) => b - a);
  // Diminishing returns: the third odd feature matters less than the first.
  const weighted = rarities.reduce((sum, r, i) => sum + r / (i + 1), 0);
  let score = Math.min(100, Math.round(weighted * 5));

  // Crossing categories is what makes a watch genuinely strange: a stone dial
  // AND a woven bracelet beats two unusual dials.
  const groups = new Set(
    scored.map((t) => spec.rules.find((r) => r.tag === t)?.group).filter(Boolean),
  );
  if (groups.size >= 3) score += 12;
  else if (groups.size === 2) score += 6;

  if (!brandKnown) score += 5;
  if (tags.some((t) => GRAILS.has(t))) score = Math.max(score, 92);

  return Math.max(0, Math.min(100, score));
}

export const isGrail = (tags: string[]) => tags.some((t) => GRAILS.has(t));

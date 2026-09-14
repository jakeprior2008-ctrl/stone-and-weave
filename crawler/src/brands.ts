/**
 * Brand and model vocabulary. Dependency-free on purpose: this file is
 * imported both by the crawler (Node) and by the web app's build-time
 * vocabulary module (see web/vocab.ts), so it must never pull in a node
 * import or anything else that would drag into the browser bundle.
 */

export const KNOWN_BRANDS = [
  'rolex', 'omega', 'patek philippe', 'audemars piguet', 'cartier', 'piaget',
  'vacheron constantin', 'jaeger-lecoultre', 'iwc', 'universal geneve', 'longines',
  'tudor', 'zenith', 'heuer', 'tag heuer', 'breitling', 'seiko', 'grand seiko',
  'citizen', 'bulova', 'hamilton', 'tissot', 'movado', 'girard-perregaux',
  'blancpain', 'chopard', 'bulgari', 'van cleef', 'baume', 'eterna', 'doxa',
  'enicar', 'favre-leuba', 'nivada', 'lip', 'gruen', 'elgin', 'waltham',
  'jaeger lecoultre', 'breguet', 'glashutte', 'a. lange', 'chronoswiss',
];

/**
 * Lower-case KNOWN_BRANDS entry -> correct display name, for every entry
 * where naive `\b\w/g` title-casing gets it wrong (acronyms, umlauts,
 * hyphenation, "&" houses, multi-word marques normalised to one form, etc).
 * Anything not listed here is fine with plain title-casing.
 */
export const BRAND_DISPLAY: Record<string, string> = {
  iwc: 'IWC',
  'a. lange': 'A. Lange & Söhne',
  'jaeger-lecoultre': 'Jaeger-LeCoultre',
  'jaeger lecoultre': 'Jaeger-LeCoultre',
  'universal geneve': 'Universal Genève',
  'tag heuer': 'TAG Heuer',
  'girard-perregaux': 'Girard-Perregaux',
  'van cleef': 'Van Cleef & Arpels',
  glashutte: 'Glashütte Original',
  'favre-leuba': 'Favre-Leuba',
  baume: 'Baume & Mercier',
  lip: 'LIP',
  nivada: 'Nivada Grenchen',
  chronoswiss: 'Chronoswiss',
  'grand seiko': 'Grand Seiko',
  'patek philippe': 'Patek Philippe',
  'audemars piguet': 'Audemars Piguet',
  'vacheron constantin': 'Vacheron Constantin',
};

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

/** The curated display-name list the UI trusts as real brands. */
export const CANONICAL_BRANDS: string[] = [
  ...new Set(KNOWN_BRANDS.map((b) => BRAND_DISPLAY[b] ?? titleCase(b))),
].sort();

/**
 * Model name -> canonical brand, title-cased the same way detectBrand()
 * would produce it. Used by the site's query parser so "tank" or "reverso"
 * can resolve to a brand filter without a user typing the maker's name.
 */
export const MODELS: Record<string, string> = {
  tank: 'Cartier',
  santos: 'Cartier',
  baignoire: 'Cartier',
  crash: 'Cartier',
  panthere: 'Cartier',
  reverso: 'Jaeger-Lecoultre',
  memovox: 'Jaeger-Lecoultre',
  'royal oak': 'Audemars Piguet',
  nautilus: 'Patek Philippe',
  calatrava: 'Patek Philippe',
  "ellipse d'or": 'Patek Philippe',
  'golden ellipse': 'Patek Philippe',
  polo: 'Piaget',
  emperador: 'Piaget',
  datejust: 'Rolex',
  'day-date': 'Rolex',
  submariner: 'Rolex',
  daytona: 'Rolex',
  cellini: 'Rolex',
  'oyster perpetual': 'Rolex',
  'gmt-master': 'Rolex',
  explorer: 'Rolex',
  speedmaster: 'Omega',
  seamaster: 'Omega',
  constellation: 'Omega',
  'de ville': 'Omega',
  carrera: 'Heuer',
  monaco: 'Heuer',
  autavia: 'Heuer',
};

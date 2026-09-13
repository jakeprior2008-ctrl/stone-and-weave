# Architecture review

Reviewed at commit `f6cbd97` (2026-09-13, 4,019 active listings). Rule used:
a **real bug** produces wrong output today; a **would do differently** is a
design choice that is fine now and will cost something later.

## Real bugs

1. **Price history records FX jitter as price changes.** Goldammer, Vintage
   Watch Leader and Mr Watchley serve prices that drift by a euro or two
   between crawls. `merge()` in `crawler/src/store.ts` pushes a history point
   on any change and reports a drop on any decrease.
   **Evidence:** 58 listings gained a second price point within one day, e.g.
   Goldammer 5205 EUR → 5206 EUR, 21173 EUR → 21179 EUR, 44829 EUR → 44843 EUR.
   Effect: "Biggest price drop" sort and the ntfy price-drop alerts fire on
   noise, and the 40-point history cap fills with junk instead of real moves.
   **Fix:** ignore changes under 1% or under £10 GBP-equivalent when
   appending history and reporting drops. Add a test in
   `crawler/test/store.test.ts`. This is fixed in a commit landing alongside
   this review, because it corrupts history on every crawl.

2. **"`firstSeen` is never overwritten" is only true inside `merge()`.** A
   full regeneration of `data/` resets every `firstSeen` and wipes all price
   history, because it writes fresh records instead of merging into the
   existing ones.
   **Evidence:** the plan for this review cites the 12:12 UTC crawl commit
   (`72971d0`) as showing 3,895 listings first seen on 2026-09-12; HEAD has
   all 4,019 listings first seen on 2026-09-13 (4,013 at 15:00-16:00, 6 at
   16:00-17:00), confirmed against the live data in this worktree. Nothing
   detected it. The regeneration was unnecessary: `merge()` already takes
   tags and oddity from the fresh item, so a taxonomy change re-scores
   everything on the next crawl while keeping history intact.
   **Recommend:** document that regeneration destroys history; add a
   `--rescore` flag that re-runs `normalise` over existing listings without
   fetching; add a guard in the Crawl workflow that fails the commit if
   `firstSeen` regressed for more than 5% of listings.

3. **A source that succeeds with zero or partial results ages out its
   inventory.** `succeededSources` is binary. A Shopify store returning an
   empty `products.json` (password page, throttling), or a JSON-LD dealer
   whose sitemap loads but whose product pages mostly fail, counts as a
   success. Two such crawls (12 hours, since the schedule is every 6 hours)
   archive the dealer's whole catalogue.
   **This borders on a bug rather than being purely a preference,** because
   it silently destroys inventory the site claims to have. Recommend:
   treat a source as failed if its count drops below, say, 50% of
   `prevMeta.count`, and hold its listings rather than archiving them.

4. **Era detection reads prices as years.** `detectEra` in
   `crawler/src/normalise.ts` matches any `19xx` token in the text, with no
   regard for what precedes it.
   **Evidence:** "£1950 Universal Genève 'White Shadow'" is tagged 1950s;
   "£19996 Patek Philippe Gondolo" and "£19995 Jaeger-LeCoultre Master
   Control" are tagged 1990s. 9 confirmed cases in the live data, likely
   more in the sold archive.
   **Fix:** exclude tokens preceded by a currency symbol or followed by a
   decimal point, and prefer an explicit "circa" match when one is present.

5. **The accessory filter misses straps and tools.** `looksLikeAccessory`
   only recognises "strap only" as a phrase. Analog Shift alligator straps,
   Lorier straps and Peak Design flat-lays are not caught and end up in the
   for-sale set, polluting "Newest found".
   **Evidence:** a sample of 13 image-host listings included a Lorier strap
   and a Peak Design product sold as accessories, not watches.
   **Fix:** add `straps?|nato|buckle|spring bar|tool kit` to `HARD_OBJECT`,
   keeping the existing pendant-watch exception so genuine watch pendants
   are not swept up with it.

6. **Brand falls back to the Shopify vendor field, which is usually the
   dealer's own name, not a watch brand.**
   **Evidence:** 295 active listings have `brand` equal to their dealer's
   name in `meta.json` (e.g. "Vintage Watch Specialist", "JPM",
   "Analog:Shift"), out of 208 distinct brand values in total across the
   whole dataset. This makes `brandKnown` true for junk, so the +5
   "unknown brand" oddity bonus never fires when it should, and it would
   poison any brand-synonym layer built from this data.
   **Fix:** only accept the vendor field as a brand if it is not the
   dealer's own name, and expose `KNOWN_BRANDS` as the canonical list
   rather than trusting whatever a store calls itself.

7. **Case size takes the first "NNmm" token in the text.** The accepted
   range is 18-50mm, so lug widths (18, 19, 20, 22) qualify as case sizes.
   **Evidence:** 502 active listings show a case size of 22mm or under.
   Many of these are legitimately small (a 22mm Tank is real), so this
   needs a look rather than a blind fix: prefer a match near the words
   "case", "diameter" or "width", and ignore one near "lug" or "strap".

## Would do differently

8. **Data growth.** Every crawl rewrites `listings.json` (5.2 MB) and
   `sold.json` (9 MB) in full, because `lastSeen` is stamped on every
   listing whether or not it changed.
   **The numbers:** the current blobs pack to roughly 0.9 MB and 1.3 MB as
   git deltas, so about 2 MB lands in the repo per crawl commit. At four
   crawls a day that is roughly 3 GB a year. GitHub recommends keeping a
   repository under 1 GB and starts warning above 5 GB. Plainly: this is
   fine for about six months and becomes a problem inside eighteen. Both
   the crawl and Vercel use shallow clones, so the growing history is never
   needed for operation, only for the repo's own health.
   **Fixes, in order of payoff:**
   - Stop stamping `lastSeen` per listing; derive it from
     `meta.lastSuccess` when `missedCrawls` is 0, so an unchanged listing
     produces no diff at all.
   - Write one record per line with a stable key order, so deltas are
     line-based and diffs stay readable.
   - When it starts to bite, move `data/` to an orphan branch that gets
     squashed quarterly. Price history already lives inside each listing,
     so nothing is lost by discarding the branch's own commit history.

9. **Oddity scoring is coherent in intent, patched in mechanism.** The
   `texture` family collapses `textured-dial` (a dial feature),
   `hammered-bracelet` (a bracelet feature) and `bark-finish` (a case
   feature) into a single scored feature. That fix was needed to stop a
   97-point bark case scoring above real grails, but it now under-counts a
   genuine textured dial plus a hammered bracelet on the same watch, which
   is exactly the cross-category combination the scoring model is meant to
   reward. Families should be scored per group, or the family collapse
   should run before the group-crossing bonus is computed on the
   pre-collapse groups. Two smaller things worth fixing alongside it: the
   code comment says the grail floor is 85 while the code enforces 92, and
   `groups` is computed with `spec.rules.find` per tag, which is fine at
   this scale but worth a note for later. Keep the model as designed; fix
   the scope of the family collapse.

10. **Module boundaries** are fine for 17 sources; two things will hurt
    once that grows toward 40.
    - `index.ts` dispatches adapters with a ternary and special-cases eBay
      inline with a fake `adapter: 'shopify'`. Make it a registry keyed on
      `Dealer.adapter` instead.
    - `web/src/types.ts` hand-duplicates `crawler/src/types.ts`
      (`status: string` in one, a union already drifted in the other).
      Share one file between them.
    - `enrich.ts` parses the taxonomy YAML at import time, so tests cannot
      inject a taxonomy of their own.

    Everything else, including the two-file crawler/web split and the sold
    archive rules living inside `index.ts`, is acceptable at this size.

11. **Crawl failure is silent.** A failing test or a failing crawl simply
    stops updates, and only GitHub Actions knows about it. Add a final
    `if: failure()` step to the workflow that posts to the ntfy topic, so a
    stalled site is visible without someone checking Actions.

8. **Reference regex captured the word itself.** `detectReference` returned
   `erence` for copy that mentions "reference" without a number; 1252
   active listings affected (use the probe's number). Fixed alongside this
   review.

## Tests that are missing and would hurt

| Area | Gap |
|---|---|
| All three adapters | Zero tests. A fixture-based test per adapter (a saved `products.json`, a saved JSON-LD page) is the highest-value gap in the suite. |
| `index.ts` | `pruneArchive`, the sold/for-sale split, and the "tagless sold listing is dropped from state" behaviour are untested. |
| `web/src/filters.ts` | `apply()` and the URL round-trip (`toQuery()`/`fromQuery()`) have no tests. |
| `crawler/src/normalise.ts` | `detectEra`, `detectCaseSize` and `detectBrand` have no tests covering the edge cases above; a regression test for each would have caught findings 4, 6 and 7 before they shipped. |
| `alerts.ts` | `matches()` is untested. |

## What is fine

Merge-on-two-absences (a listing missing from one crawl is not deleted),
per-source failure isolation (one dealer erroring does not affect the
others), the push-retry loop for the crawl's commit race, the split data
files (for-sale loads up front, sold is fetched on demand), hotlinking
dealer images rather than copying them, and gating the crawl workflow on
the test suite. None of this needs to change.

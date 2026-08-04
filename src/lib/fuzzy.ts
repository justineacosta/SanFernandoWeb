/**
 * Forgiving text matching for datasets that are already in memory.
 *
 * This is the JavaScript half of the search contract; the SQL half is
 * `public.fuzzy_match()` (migrations 0016/0017, final form 0034). Both
 * implement the same rule, so a user cannot tell which one answered:
 *
 *   Split the query on whitespace. A record matches only if EVERY term matches
 *   it. A term matches if the record's haystack contains it as a substring, or
 *   if some WORD of the haystack is within a small edit distance of it.
 *
 * Substring carries the partial case ("cert" -> certificate). Edit distance
 * carries misspellings and transpositions ("offcal" -> official, "sanots" ->
 * Santos). AND-across-terms makes "juan dela" narrow rather than widen, and
 * makes "juan banana" correctly return nothing.
 *
 * The SQL half carried a third route until 0034 — `word_similarity(term,
 * haystack) >= 0.45` — which this file never had. That asymmetry was recorded
 * as deliberate but turned out to be the whole reason global search returned
 * results no in-table search did (it answered "Curfew Hours for Minors" to
 * "tax"). It is gone; the two halves now genuinely agree. Do not add a trigram
 * route here to "restore parity" — parity already holds, in the other
 * direction.
 *
 * Matching per WORD rather than against the whole haystack is the load-bearing
 * detail. Scoring a short term against a long concatenated string is far too
 * permissive — measured against realistic rows, a whole-string scorer could not
 * accept "sanots" -> Santos without also accepting "banana" -> Barangay. Words
 * are compared to words, which is both stricter and easier to reason about.
 */

/**
 * Edit-distance budget. Short terms get 1: at 2, a four-letter term reaches
 * most four-letter words and search stops discriminating.
 */
function budgetFor(term: string): number {
  return term.length <= 4 ? 1 : 2;
}

/**
 * Levenshtein distance, abandoned as soon as it provably exceeds `max`.
 *
 * The early exits matter more than the algorithm here: this runs for every
 * term against every word of every row on each keystroke, and the vast
 * majority of pairs are nowhere near each other.
 */
function withinDistance(a: string, b: string, max: number): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > max) return false;

  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      const value = Math.min(
        previous[j]! + 1, // deletion
        current[j - 1]! + 1, // insertion
        previous[j - 1]! + cost, // substitution
      );
      current[j] = value;
      if (value < rowMin) rowMin = value;
    }
    // Every later row is >= this row's minimum, so the answer can only grow.
    if (rowMin > max) return false;
    previous = current;
  }
  return previous[b.length]! <= max;
}

function matchesTerm(words: string[], joined: string, term: string): boolean {
  if (joined.includes(term)) return true;
  const budget = budgetFor(term);
  return words.some((word) => withinDistance(term, word, budget));
}

interface Prepared {
  index: number;
  joined: string;
  words: string[];
}

/**
 * Filter `items` by `query`, matching against the string `haystackOf` builds
 * for each item. An empty query returns the input untouched.
 *
 * Input order is preserved rather than re-ranked by relevance: these tables are
 * sorted by date or status and offer column sorting, so silently reordering
 * them mid-search would fight the sort the user chose.
 */
export function fuzzyFilter<T>(
  items: T[],
  query: string,
  haystackOf: (item: T) => string,
): T[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return items;

  const prepared: Prepared[] = items.map((item, index) => {
    const joined = haystackOf(item).toLowerCase();
    return { index, joined, words: joined.split(/\s+/).filter(Boolean) };
  });

  const keep = new Set(
    prepared
      .filter((row) => terms.every((term) => matchesTerm(row.words, row.joined, term)))
      .map((row) => row.index),
  );

  return items.filter((_, index) => keep.has(index));
}

/**
 * Join field values into a searchable haystack, dropping blanks so absent
 * fields cannot introduce runs of separator characters that a term might
 * accidentally match.
 */
export function haystack(...parts: (string | null | undefined)[]): string {
  return parts.filter((part) => part && part.trim() !== "").join(" ");
}

import { Parser } from 'htmlparser2';

/**
 * Bounding how deeply markup nests before it's parsed for real (FEE-57, Q8).
 *
 * htmlparser2 keeps its open elements with `Array.unshift`/`shift`, so under V8 each tag costs as
 * much as the depth it's at: a document nested n deep costs n² to parse. Readability's scoring
 * then grows faster still (about 1 s at 500 levels, 7.5 s at 1,000), and a 50,000-deep page under
 * the 2 MB fetch cap (T18) took 35 s to extract. Real pages nest a few dozen levels, so markup is
 * cut where it passes `MAX_NESTING`, and everything after is left out.
 *
 * The depth is measured by htmlparser2 itself, the one parser behind the cleaner, the Feed reader
 * and linkedom (package.json overrides linkedom's copy with ours), so every rule that decides
 * nesting (implied closes, "/>" ignored outside SVG, raw text, unmatched closers) is the real one,
 * never a copy that could drift. The measuring parse stops the moment it passes the limit, so its
 * own stack never grows past it and it stays linear.
 */

/**
 * Deeper than this is hostile, not writing: real pages nest a few dozen levels (Lighthouse warns
 * past 32). At this depth Readability takes tens of milliseconds.
 */
export const MAX_NESTING = 128;

/** Thrown to stop the measuring parse once it has seen enough. */
const TOO_DEEP = Symbol('too deep');

/**
 * `markup`, cut at the tag where its open elements first nest deeper than `MAX_NESTING`, or
 * unchanged when they never do. `xml`: measured as a feed, as `parseFeed` reads it.
 */
export function boundNesting(markup: string, { xml = false }: { xml?: boolean } = {}): string {
  let depth = 0;
  let cut = -1;
  const parser = new Parser(
    {
      onopentagname() {
        depth++;
        if (depth > MAX_NESTING) {
          cut = parser.startIndex;
          throw TOO_DEEP;
        }
      },
      onclosetag() {
        depth--;
      },
    },
    { xmlMode: xml, decodeEntities: false },
  );
  try {
    parser.end(markup);
  } catch (error) {
    if (error !== TOO_DEEP) throw error;
  }
  return cut < 0 ? markup : markup.slice(0, cut);
}

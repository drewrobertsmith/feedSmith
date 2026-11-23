/**
 * Bounding how deeply markup nests before any parser sees it (FEE-57, Q8).
 *
 * htmlparser2 (ours, and the copy linkedom uses for Readability) keeps its open elements with
 * `Array.unshift`/`shift`, so under V8 each tag costs as much as the depth it's at: a document
 * nested n deep costs n² to parse. Readability's scoring then grows faster still with depth (about
 * 1 s at 500 levels, 7.5 s at 1,000). A 50,000-deep page under the 2 MB fetch cap (T18) took 35 s
 * to extract. Real pages nest a few dozen deep, so markup is cut where it passes `MAX_NESTING`, and
 * everything after is left out.
 */

/**
 * Deeper than this is hostile, not writing: real pages nest a few dozen levels (Lighthouse warns
 * past 32). At this depth Readability takes tens of milliseconds.
 */
export const MAX_NESTING = 128;

/** HTML elements that never have contents, so they never deepen the stack. */
const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'keygen', 'link', 'meta', 'param', 'source',
  'track', 'wbr', 'basefont', 'bgsound', 'frame', 'image', 'isindex', 'menuitem',
]);

/**
 * HTML elements a parser closes by itself when the next one opens (`<p>`, `<li>`, a table's cells
 * and rows…), so a page that leaves them open doesn't grow the stack. Not counting them keeps such
 * a page whole; at worst, true nesting of them is bounded a little later.
 */
const SELF_CLOSING_IN_HTML = new Set([
  'p', 'li', 'dt', 'dd', 'option', 'optgroup', 'tr', 'td', 'th', 'thead', 'tbody', 'tfoot', 'rb', 'rt',
  'rtc', 'rp', 'colgroup', 'caption', 'head', 'body', 'html',
]);

/** HTML elements whose contents are text, never tags, however they look. */
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title', 'xmp', 'iframe', 'noembed', 'noframes', 'plaintext']);

const isNameStart = (code: number) =>
  (code >= 97 && code <= 122) || (code >= 65 && code <= 90) || code === 95 || code === 58; // a-z A-Z _ :

/**
 * `markup`, cut where its open elements first nest deeper than `MAX_NESTING`, or unchanged when
 * they never do. One pass over the text: comments, doctypes and processing instructions are
 * skipped whole, as are the contents of HTML's raw-text elements (`<script>`, `<style>`…). With
 * `xml`, every element counts except those closed with `/>`.
 */
export function boundNesting(markup: string, { xml = false }: { xml?: boolean } = {}): string {
  let depth = 0;
  let at = 0;
  for (;;) {
    const open = markup.indexOf('<', at);
    if (open < 0) return markup;
    const next = markup.charCodeAt(open + 1);
    // A comment, doctype or CDATA (<!…>), or a processing instruction (<?…?>): skipped whole.
    if (next === 33 /* ! */ || next === 63 /* ? */) {
      const end = markup.startsWith('<!--', open) ? markup.indexOf('-->', open + 4) : markup.indexOf('>', open + 2);
      if (end < 0) return markup;
      at = end + 1;
      continue;
    }
    const closing = next === 47; /* / */
    const nameStart = closing ? open + 2 : open + 1;
    // A stray "<" in text ("1 < 2") isn't a tag.
    if (!isNameStart(markup.charCodeAt(nameStart))) {
      at = open + 1;
      continue;
    }
    const end = markup.indexOf('>', nameStart);
    if (end < 0) return markup;
    let nameEnd = nameStart;
    while (nameEnd < end && !/[\s/>]/.test(markup[nameEnd])) nameEnd++;
    const name = markup.slice(nameStart, nameEnd).toLowerCase();
    at = end + 1;

    if (closing) {
      if (xml || !(VOID.has(name) || SELF_CLOSING_IN_HTML.has(name))) depth = Math.max(0, depth - 1);
      continue;
    }
    if (markup.charCodeAt(end - 1) === 47 /* / */) continue; // <tag/>
    if (!xml && RAW_TEXT.has(name)) {
      // Its contents are text: jump to its closing tag, or to the end.
      // Searched from here, case-insensitively, without copying the markup: the scan stays linear.
      const closer = new RegExp(`</${name}`, 'gi');
      closer.lastIndex = at;
      const close = closer.exec(markup);
      if (!close) return markup;
      at = close.index;
      continue;
    }
    if (!xml && (VOID.has(name) || SELF_CLOSING_IN_HTML.has(name))) continue;
    depth++;
    if (depth > MAX_NESTING) return markup.slice(0, open);
  }
}

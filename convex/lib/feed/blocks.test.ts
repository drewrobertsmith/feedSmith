import { parseDocument } from 'htmlparser2';
import { describe, expect, test } from 'vitest';

import { type Block, htmlToBlocks, httpsUrl, MAX_BLOCKS, MAX_DEPTH, MAX_ENTRIES, MAX_SIZE, MAX_SPANS, MAX_URL, NO_BASE } from './blocks';
import { MAX_BYTES } from './http';

const BASE = 'https://example.com/posts/1';

describe('hostile HTML never reaches the stored blocks (Q8)', () => {
  test('scripts, styles and their text are dropped', () => {
    const { blocks } = htmlToBlocks(
      '<p>Hello</p><script>alert(1)</script><style>p{}</style><noscript>x</noscript><p>World</p>',
      BASE,
    );
    expect(blocks).toEqual([
      { type: 'paragraph', spans: [{ text: 'Hello' }] },
      { type: 'paragraph', spans: [{ text: 'World' }] },
    ]);
  });

  test('event handlers and other attributes never survive', () => {
    const { blocks } = htmlToBlocks('<p onclick="steal()" style="color:red" class="x">Hi</p>', BASE);
    expect(JSON.stringify(blocks)).not.toMatch(/steal|style|class|onclick/);
    expect(blocks).toEqual([{ type: 'paragraph', spans: [{ text: 'Hi' }] }]);
  });

  test.each(['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,x', 'http://example.com/', 'vbscript:x'])(
    'a %s link keeps its text but loses the link',
    (href) => {
      const { blocks } = htmlToBlocks(`<p><a href="${href}">click</a></p>`, BASE);
      expect(blocks).toEqual([{ type: 'paragraph', spans: [{ text: 'click' }] }]);
    },
  );

  test('an iframe becomes an omitted embed, a video an omitted video', () => {
    const { blocks, omitted } = htmlToBlocks(
      '<p>a</p><iframe src="https://evil.example/"></iframe><video src="https://x/v.mp4"></video>',
      BASE,
    );
    expect(blocks).toEqual([
      { type: 'paragraph', spans: [{ text: 'a' }] },
      { type: 'omitted', kind: 'embed' },
      { type: 'omitted', kind: 'video' },
    ]);
    expect(omitted).toEqual(['embed', 'video']);
  });

  test.each([
    ['a 1×1 tracking pixel', '<img src="https://t.example/p.gif" width="1" height="1">'],
    ['a zero-size pixel', '<img src="https://t.example/p.gif" width="0" height="0">'],
    ['a data: image', '<img src="data:image/gif;base64,R0lGOD">'],
    ['an http image', '<img src="http://example.com/a.jpg">'],
    ['an image with no source', '<img alt="x">'],
  ])('%s is dropped', (_case, html) => {
    expect(htmlToBlocks(html, BASE)).toEqual({ blocks: [], omitted: [] });
  });

  test("relative links and images in a Feed with no address resolve to nothing, never a placeholder", () => {
    const { blocks } = htmlToBlocks('<p><a href="/x">x</a></p><img src="/i.jpg">', NO_BASE);
    expect(blocks).toEqual([{ type: 'paragraph', spans: [{ text: 'x' }] }]);
  });

  test('forms and inputs are dropped', () => {
    expect(htmlToBlocks('<form action="https://x"><input name="pw"><button>Go</button></form>', BASE).blocks).toEqual([]);
  });

  test(`stops at ${MAX_BLOCKS} blocks and notes the rest as omitted`, () => {
    const html = '<p>x</p>'.repeat(MAX_BLOCKS + 50);
    const { blocks, omitted } = htmlToBlocks(html, BASE);
    expect(blocks).toHaveLength(MAX_BLOCKS + 1);
    expect(blocks.at(-1)).toEqual({ type: 'omitted', kind: 'other' });
    expect(omitted).toEqual(['other']);
  });

  test('like spans merged into one keep single spaces where they joined', () => {
    const { blocks } = htmlToBlocks('<p><span>a </span><span> b</span>\n<span>c</span><br><br>d</p>', BASE);
    expect(blocks).toEqual([{ type: 'paragraph', spans: [{ text: 'a b c d' }] }]);
  });

  test(`a run of styles keeps at most ${MAX_SPANS} spans per block, losing no text`, () => {
    const html = `<p>${'<b>x</b>y'.repeat(5000)}</p>`;
    const [block] = htmlToBlocks(html, BASE).blocks;
    if (block.type !== 'paragraph') throw new Error('expected a paragraph');
    expect(block.spans.length).toBeLessThanOrEqual(MAX_SPANS);
    expect(block.spans.map((s) => s.text).join('')).toBe('xy'.repeat(5000));
  });

  test(`keeps an Article's blocks under ${MAX_SIZE} characters of stored JSON, overhead included`, () => {
    // Each paragraph holds 1,000 characters of text but about 25,000 of JSON, so 20 of them pass
    // the cap on overhead alone, from 160 KB of HTML (FEE-68).
    const html = `<p>${'<b>x</b><i>y</i>'.repeat(500)}</p>`.repeat(20);
    const { blocks } = htmlToBlocks(html, BASE);
    expect(JSON.stringify(blocks).length).toBeLessThanOrEqual(MAX_SIZE + 100);
    expect(blocks.length).toBeLessThan(20);
    expect(blocks.at(-1)).toEqual({ type: 'omitted', kind: 'other' });
  });

  test(`a page at the ${MAX_BYTES} byte fetch cap costs a few parses, not a second (FEE-68)`, () => {
    const unit = '<span>x</span>';
    const count = Math.floor(MAX_BYTES / unit.length) - 1;
    const html = `<p>${unit.repeat(count)}</p>`;
    const time = (work: () => unknown) => {
      const start = performance.now();
      work();
      return performance.now() - start;
    };
    // Warm the JIT on this very input, so the times below are the work's.
    parseDocument(html, { decodeEntities: true });
    htmlToBlocks(unit.repeat(1000), BASE);
    // Timed against the parser on the same input, so a busy machine slows both alike.
    const parse = time(() => parseDocument(html, { decodeEntities: true }));
    let blocks: Block[] = [];
    const clean = time(() => ({ blocks } = htmlToBlocks(html, BASE)));
    // Like spans merge into one run, joined once. Rescanning the run on every merge cost 16 parses.
    expect(clean).toBeLessThan(parse * 5);
    expect(blocks).toEqual([{ type: 'paragraph', spans: [{ text: 'x'.repeat(count) }] }]);
  });

  test('a link too long to be real is kept as plain text, never copied into each span', () => {
    // One huge href repeated in 999 spans once cost hundreds of MB of JSON (FEE-68).
    const href = `https://a.example/${'p'.repeat(MAX_BYTES - 20_000)}`;
    const html = `<p><a href="${href}">${'<b>x</b>y'.repeat(999)}</a></p>`;
    const start = performance.now();
    const [block] = htmlToBlocks(html, BASE).blocks;
    expect(performance.now() - start).toBeLessThan(1000);
    if (block.type !== 'paragraph') throw new Error('expected a paragraph');
    expect(block.spans.some((span) => span.href)).toBe(false);
    expect(block.spans.map((span) => span.text).join('')).toBe('xy'.repeat(999));
  });

  test(`a URL is kept up to ${MAX_URL} characters, and dropped past them`, () => {
    const url = (length: number) => `https://a.example/${'p'.repeat(length - 'https://a.example/'.length)}`;
    expect(httpsUrl(url(MAX_URL), BASE)).toBe(url(MAX_URL));
    expect(httpsUrl(url(MAX_URL + 1), BASE)).toBeUndefined();
    // Short as written, too long once resolved against the Article's address.
    expect(httpsUrl('p'.repeat(MAX_URL - 10), BASE)).toBeUndefined();
  });

  test(`a list keeps at most ${MAX_ENTRIES} entries, and a quote as many paragraphs`, () => {
    const list = htmlToBlocks(`<ul>${'<li>x</li>'.repeat(10_000)}</ul>`, BASE).blocks;
    expect(list[0].type === 'list' && list[0].items.length).toBe(MAX_ENTRIES);
    expect(list.at(-1)).toEqual({ type: 'omitted', kind: 'other' });
    const quote = htmlToBlocks(`<blockquote>${'<p>x</p>'.repeat(10_000)}</blockquote>`, BASE).blocks;
    expect(quote[0].type === 'quote' && quote[0].paragraphs.length).toBe(MAX_ENTRIES);
  });

  test(`markup nested 50,000 deep never overflows the stack, and is cleaned in a blink (FEE-57)`, () => {
    const deep = (tag: string) => `${`<${tag}>`.repeat(50_000)}deep${`</${tag}>`.repeat(50_000)}`;
    for (const html of [deep('div'), `<p>${deep('span')}</p>`]) {
      const start = performance.now();
      expect(() => htmlToBlocks(html, BASE)).not.toThrow();
      // The parser's cost grows with the square of the depth; bounded first, it never gets the chance.
      expect(performance.now() - start).toBeLessThan(250);
    }
  });

  test('what comes before hostile nesting is kept, and the rest is noted as left out (FEE-57)', () => {
    const { blocks, omitted } = htmlToBlocks(`<p>Kept.</p>${'<div>'.repeat(50_000)}lost`, BASE);
    expect(blocks[0]).toEqual({ type: 'paragraph', spans: [{ text: 'Kept.' }] });
    expect(JSON.stringify(blocks)).not.toContain('lost');
    expect(omitted).toContain('other');
  });

  test.each(['constructor', 'toString', 'hasOwnProperty'])('a <%s> tag is just a container', (tag) => {
    expect(htmlToBlocks(`<${tag}>Hi</${tag}>`, BASE).blocks).toEqual([{ type: 'paragraph', spans: [{ text: 'Hi' }] }]);
  });
});

describe('what passes through (T17)', () => {
  test('bold, italic and https links become spans', () => {
    const { blocks } = htmlToBlocks(
      '<p>Plain <strong>bold</strong> <em>italic</em> <a href="https://example.com/a">link</a>.</p>',
      BASE,
    );
    expect(blocks).toEqual([
      {
        type: 'paragraph',
        spans: [
          { text: 'Plain ' },
          { text: 'bold', bold: true },
          { text: ' ' },
          { text: 'italic', italic: true },
          { text: ' ' },
          { text: 'link', href: 'https://example.com/a' },
          { text: '.' },
        ],
      },
    ]);
  });

  test('relative links and images resolve against the Article, and must end up https', () => {
    const { blocks } = htmlToBlocks('<p><a href="/b">b</a></p><img src="/i.jpg" alt="An image">', BASE);
    expect(blocks).toEqual([
      { type: 'paragraph', spans: [{ text: 'b', href: 'https://example.com/b' }] },
      { type: 'image', src: 'https://example.com/i.jpg', alt: 'An image' },
    ]);
  });

  test('headings, lists and quotes', () => {
    const { blocks } = htmlToBlocks(
      '<h3>Head</h3><ul><li>One</li><li><b>Two</b></li></ul><ol><li>First</li></ol><blockquote><p>Said.</p><p>Again.</p></blockquote>',
      BASE,
    );
    expect(blocks).toEqual([
      { type: 'heading', spans: [{ text: 'Head' }] },
      { type: 'list', ordered: false, items: [[{ text: 'One' }], [{ text: 'Two', bold: true }]] },
      { type: 'list', ordered: true, items: [[{ text: 'First' }]] },
      { type: 'quote', paragraphs: [[{ text: 'Said.' }], [{ text: 'Again.' }]] },
    ]);
  });

  test('a figure becomes an image with its caption', () => {
    const { blocks } = htmlToBlocks(
      '<figure><img src="https://cdn.example/a.jpg" alt="Robot" width="1200" height="800"><figcaption>A robot. <em>Photo: Someone</em></figcaption></figure>',
      BASE,
    );
    expect(blocks).toEqual([
      { type: 'image', src: 'https://cdn.example/a.jpg', alt: 'Robot', caption: 'A robot. Photo: Someone', width: 1200, height: 800 },
    ]);
  });

  test('a table and a code block are omitted in place', () => {
    const { blocks, omitted } = htmlToBlocks('<p>a</p><table><tr><td>1</td></tr></table><pre>code</pre><p>b</p>', BASE);
    expect(blocks).toEqual([
      { type: 'paragraph', spans: [{ text: 'a' }] },
      { type: 'omitted', kind: 'table' },
      { type: 'omitted', kind: 'code' },
      { type: 'paragraph', spans: [{ text: 'b' }] },
    ]);
    expect(omitted).toEqual(['table', 'code']);
  });

  test('loose text and containers become paragraphs; whitespace collapses; entities decode', () => {
    const { blocks } = htmlToBlocks('<div>Loose   text\n here &amp; there</div><div><p>Inner</p></div>', BASE);
    expect(blocks).toEqual([
      { type: 'paragraph', spans: [{ text: 'Loose text here & there' }] },
      { type: 'paragraph', spans: [{ text: 'Inner' }] },
    ]);
  });

  test('empty paragraphs are left out', () => {
    expect(htmlToBlocks('<p> </p><p><br></p>', BASE).blocks).toEqual([]);
  });
});

import type { ArticleRow, ReadingArticle } from '@/feeds/feeds-data';

/** Midday UTC, so the date reads the same in every time zone a test runs in. */
const day = (d: number) => Date.UTC(2026, 10, d, 12);

const VERGE = 'The Verge';

/** Two hours after the newest fixture Article: the "now" fixture rows are seen from. */
export const FIXTURE_NOW = Date.UTC(2026, 10, 21, 14);

const VERGE_FACE = { feedTitle: VERGE, faviconUrl: 'https://www.theverge.com/favicon.ico' };

/**
 * All, as a few Feeds would fill it: newest first, with every kind of row (P12): image and
 * Subtitle, no image, no Subtitle, a long title, a Feed with no favicon, and one Read.
 */
export const FIXTURE_ROWS: ArticleRow[] = [
  {
    id: 'a1',
    title: 'The UN fails to agree on rules regulating ‘killer robots’',
    subtitle: 'Countries agree to ‘start discussing options’ for rules around autonomous weapons.',
    imageUrl: 'https://platform.theverge.com/wp-content/uploads/sites/2/chorus/uploads/chorus_asset/file/13611631/503831564.jpg.jpg',
    ...VERGE_FACE,
    publishedAt: day(21),
    read: false,
  },
  {
    id: 'a2',
    title: 'The FBI and USDA were reportedly hacked',
    subtitle: 'Investigators say the intrusions began months ago and reached systems holding staff records.',
    ...VERGE_FACE,
    publishedAt: day(20),
    read: true,
  },
  {
    id: 'a3',
    title: 'Amazon’s first digital photo frame is up to 50 percent off for Black Friday, and it’s the cheapest it has ever been',
    imageUrl: 'https://platform.theverge.com/wp-content/uploads/sites/2/2026/11/frame.jpg',
    ...VERGE_FACE,
    publishedAt: day(19),
    read: false,
  },
  { id: 'a4', title: 'A quiet guide to slow reading', feedTitle: 'Calm Notes', publishedAt: day(17), read: false },
];

/** Every Article in All Read. */
export const FIXTURE_READ_ROWS: ArticleRow[] = FIXTURE_ROWS.map((row) => ({ ...row, read: true }));

/** An Article with every kind of block the Reading view draws (T17). */
export const FIXTURE_ARTICLE: ReadingArticle = {
  title: FIXTURE_ROWS[0].title,
  feedTitle: VERGE,
  publishedAt: day(21),
  link: 'https://www.theverge.com/tech/1039554/un-regulations-killer-robots',
  omitted: [],
  blocks: [
    {
      type: 'image',
      src: 'https://platform.theverge.com/wp-content/uploads/sites/2/chorus/uploads/chorus_asset/file/13611631/503831564.jpg.jpg',
      alt: 'A military drone on a runway',
      caption: 'Photo by John Moore / Getty Images',
      width: 2040,
      height: 1360,
    },
    {
      type: 'paragraph',
      spans: [
        { text: 'After a week of talks, countries agreed only to ' },
        { text: 'start discussing options', italic: true },
        { text: ' for rules around autonomous weapons, ' },
        { text: 'Reuters reports', href: 'https://www.reuters.com/' },
        { text: '.' },
      ],
    },
    { type: 'heading', spans: [{ text: 'What was on the table' }] },
    {
      type: 'list',
      ordered: false,
      items: [
        [{ text: 'A ban on weapons that pick targets without a person' }],
        [{ text: 'Rules for ' }, { text: 'meaningful human control', bold: true }],
      ],
    },
    {
      type: 'quote',
      paragraphs: [[{ text: 'The window for preventive regulation is closing.' }]],
    },
    { type: 'paragraph', spans: [{ text: 'Talks resume next year.' }] },
  ],
};

/** An Article whose Feed had a video and a table, which feedSmith doesn't show yet. */
export const FIXTURE_OMITTED_ARTICLE: ReadingArticle = {
  ...FIXTURE_ARTICLE,
  omitted: ['video', 'table'],
  blocks: [
    { type: 'paragraph', spans: [{ text: 'Here is the launch in full:' }] },
    { type: 'omitted', kind: 'video' },
    { type: 'paragraph', spans: [{ text: 'And how the prices compare:' }] },
    { type: 'omitted', kind: 'table' },
  ],
};

/** The feeds a site like The Verge advertises, to choose from (T21). */
export const FIXTURE_CHOICES = [
  { url: 'https://www.theverge.com/rss/index.xml', title: 'The Verge' },
  { url: 'https://www.theverge.com/rss/reviews/index.xml', title: 'The Verge – Reviews' },
  { url: 'https://www.theverge.com/rss/policy/index.xml', title: 'The Verge – Policy' },
];

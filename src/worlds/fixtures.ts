import type { Account } from '@/auth/auth-context';
import type { ArticleRow, FeedChip, ManagedFeed, ReadingArticle } from '@/feeds/feeds-data';

/** Midday UTC, so the date reads the same in every time zone a test runs in. */
const day = (d: number) => Date.UTC(2026, 10, d, 12);

const VERGE = 'The Verge';

/** Two hours after the newest fixture Article: the "now" fixture rows are seen from. */
export const FIXTURE_NOW = Date.UTC(2026, 10, 21, 14);

const VERGE_FACE = { feedId: 'f1', feedTitle: VERGE, faviconUrl: 'https://www.theverge.com/favicon.ico' };

/**
 * All, as a few Feeds would fill it: newest first, with every kind of row (P12): image and
 * Subtitle, no image, no Subtitle, a long title, a Feed with no favicon, and one Read; one
 * author, two, and none (FEE-41).
 */
export const FIXTURE_ROWS: ArticleRow[] = [
  {
    id: 'a1',
    title: 'The UN fails to agree on rules regulating ‘killer robots’',
    subtitle: 'Countries agree to ‘start discussing options’ for rules around autonomous weapons.',
    imageUrl: 'https://platform.theverge.com/wp-content/uploads/sites/2/chorus/uploads/chorus_asset/file/13611631/503831564.jpg.jpg',
    authors: ['Terrence O’Brien'],
    ...VERGE_FACE,
    publishedAt: day(21),
    read: false,
  },
  {
    id: 'a2',
    title: 'The FBI and USDA were reportedly hacked',
    subtitle: 'Investigators say the intrusions began months ago and reached systems holding staff records.',
    authors: ['Emma Roth', 'Jay Peters'],
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
  { id: 'a4', feedId: 'f2', title: 'A quiet guide to slow reading', feedTitle: 'Calm Notes', publishedAt: day(17), read: false },
];

/** Every Article in All Read. */
export const FIXTURE_READ_ROWS: ArticleRow[] = FIXTURE_ROWS.map((row) => ({ ...row, read: true }));

/** An Article with every kind of block the Reading view draws (T17). */
export const FIXTURE_ARTICLE: ReadingArticle = {
  title: FIXTURE_ROWS[0].title,
  feedTitle: VERGE,
  publishedAt: day(21),
  link: 'https://www.theverge.com/tech/1039554/un-regulations-killer-robots',
  subtitle: 'Countries agreed only to start discussing options for autonomous weapons.',
  authors: ['Terrence O’Brien'],
  // The Feed's lead image is also the first image in its text: the Reading view shows it once.
  imageUrl: 'https://platform.theverge.com/wp-content/uploads/sites/2/chorus/uploads/chorus_asset/file/13611631/503831564.jpg.jpg',
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

/** An Article with no lead image: its text starts straight after the meta (P13). */
export const FIXTURE_NO_LEAD_IMAGE_ARTICLE: ReadingArticle = {
  ...FIXTURE_ARTICLE,
  imageUrl: undefined,
  blocks: FIXTURE_ARTICLE.blocks.filter((block) => block.type !== 'image'),
};

/** An Article credited to four people: the byline names two and counts the rest (FEE-41). */
export const FIXTURE_SEVERAL_AUTHORS_ARTICLE: ReadingArticle = {
  ...FIXTURE_ARTICLE,
  authors: ['Terrence O’Brien', 'Emma Roth', 'Jay Peters', 'Sheena Vasani'],
};

/** An Article its Feed credits to nobody: no byline line at all. */
export const FIXTURE_NO_AUTHOR_ARTICLE: ReadingArticle = { ...FIXTURE_ARTICLE, authors: undefined };

/** A Feed whose name won't fit on one line, as The Verge's subscriber Feed names itself. */
export const FIXTURE_LONG_FEED_ARTICLE: ReadingArticle = {
  ...FIXTURE_ARTICLE,
  feedTitle: 'The Verge - Full RSS for subscribers | The Verge',
};

const CALM_SUBTITLE = 'Why reading slowly is worth it, and how to start.';

/** A summary-only Article whose page is still being read (FEE-25, T8). */
export const FIXTURE_EXTRACTING_ARTICLE: ReadingArticle = {
  title: 'The Art of Slow Reading',
  feedTitle: 'Calm Notes',
  publishedAt: day(18),
  link: 'https://calmnotes.example/2026/slow-reading',
  subtitle: CALM_SUBTITLE,
  blocks: [{ type: 'paragraph', spans: [{ text: CALM_SUBTITLE }] }],
  omitted: [],
  page: 'extracting',
};

/** A summary-only Article whose page couldn't be read: the fallback (Q6). */
export const FIXTURE_UNEXTRACTED_ARTICLE: ReadingArticle = {
  ...FIXTURE_EXTRACTING_ARTICLE,
  // A real image, so the gallery shows the fallback as a reader would see it.
  imageUrl: 'https://platform.theverge.com/wp-content/uploads/sites/2/chorus/uploads/chorus_asset/file/13611631/503831564.jpg.jpg',
  page: 'unavailable',
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

/**
 * The chip row (P9): one Pinned Feed, then the rest by their newest Article. Calm Notes has no
 * icon; Daring Fireball has no Articles in the last 30 days.
 */
export const FIXTURE_CHIPS: FeedChip[] = [
  { id: 'f1', title: VERGE, faviconUrl: 'https://www.theverge.com/favicon.ico', pinned: true },
  { id: 'f2', title: 'Calm Notes', pinned: false },
  { id: 'f3', title: 'Daring Fireball', faviconUrl: 'https://daringfireball.net/favicon.ico', pinned: false },
];

/** Someone following eight Feeds, one with a long name: the chip row runs off-screen (FEE-44). */
export const FIXTURE_MANY_CHIPS: FeedChip[] = [
  { id: 'f1', title: 'The Verge - Full RSS for subscribers | The Verge', faviconUrl: 'https://www.theverge.com/favicon.ico', pinned: true },
  { id: 'f2', title: 'Calm Notes', pinned: false },
  { id: 'f3', title: 'Daring Fireball', faviconUrl: 'https://daringfireball.net/favicon.ico', pinned: false },
  { id: 'f4', title: 'Farnam Street', pinned: false },
  { id: 'f5', title: 'Stratechery', pinned: false },
  { id: 'f6', title: 'Six Colors', pinned: false },
  { id: 'f7', title: 'MacStories', pinned: false },
  { id: 'f8', title: 'Kottke', pinned: false },
];

/** Manage Feeds (D13): one Pinned Feed, then the rest by name; Farnam Street has stopped working. */
export const FIXTURE_MANAGE: ManagedFeed[] = [
  { id: 'f1', title: VERGE, faviconUrl: 'https://www.theverge.com/favicon.ico', host: 'www.theverge.com', pinned: true, working: true },
  { id: 'f2', title: 'Calm Notes', host: 'calmnotes.example', pinned: false, working: true },
  { id: 'f4', title: 'Farnam Street', faviconUrl: 'https://fs.blog/favicon.ico', host: 'fs.blog', pinned: false, working: false },
];

/** Three Pinned Feeds, so they can be ordered, and a fourth Pin is refused. */
export const FIXTURE_MANAGE_PINNED: ManagedFeed[] = [
  { ...FIXTURE_MANAGE[0] },
  { ...FIXTURE_MANAGE[1], pinned: true },
  { ...FIXTURE_MANAGE[2], pinned: true },
  { id: 'f3', title: 'Daring Fireball', host: 'daringfireball.net', pinned: false, working: true },
];

/** The signed-in User's Account (P17): a made-up person, never the owner's real Google account (Q22). */
export const FIXTURE_ACCOUNT: Account = { name: 'Ada Lovelace', email: 'ada@example.com', initial: 'A' };

import type { Account } from '@/auth/auth-context';
import type { ArticleRow, FeedChip, FoundFeed, ManagedFeed, ReadingArticle } from '@/feeds/feeds-data';
import { FARNAM_ICON, FIREBALL_ICON, FRAME_PHOTO, RUNWAY_PHOTO, VERGE_ICON } from '@/worlds/fixture-images';

/** Midday UTC, so the date reads the same in every time zone a test runs in. */
const day = (d: number) => Date.UTC(2026, 10, d, 12);

const VERGE = 'The Verge';

/** When a world's Feeds were last fetched: five minutes before "now" (FEE-47). */
export const FIXTURE_LAST_UPDATED_AGO = 5 * 60_000;

/** Two hours after the newest fixture Article: the "now" fixture rows are seen from. */
export const FIXTURE_NOW = Date.UTC(2026, 10, 21, 14);

const VERGE_FACE = { feedId: 'f1', feedTitle: VERGE, faviconUrl: VERGE_ICON };

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
    imageUrl: RUNWAY_PHOTO,
    authors: ['Terrence O’Brien'],
    ...VERGE_FACE,
    publishedAt: day(21),
    read: false,
    saved: false,
  },
  {
    id: 'a2',
    title: 'The FBI and USDA were reportedly hacked',
    subtitle: 'Investigators say the intrusions began months ago and reached systems holding staff records.',
    authors: ['Emma Roth', 'Jay Peters'],
    ...VERGE_FACE,
    publishedAt: day(20),
    read: true,
    saved: true,
  },
  {
    id: 'a3',
    title: 'Amazon’s first digital photo frame is up to 50 percent off for Black Friday, and it’s the cheapest it has ever been',
    imageUrl: FRAME_PHOTO,
    ...VERGE_FACE,
    publishedAt: day(19),
    read: false,
    saved: true,
  },
  { id: 'a4', feedId: 'f2', title: 'A quiet guide to slow reading', feedTitle: 'Calm Notes', publishedAt: day(17), read: false, saved: false },
];

/**
 * Daring Fireball's last posts, kept although they're months old (FEE-93): a Feed keeps its five newest,
 * whatever their age, so a rare writer's page shows them. All stays on the last 30 days, so
 * these show only on Daring Fireball's own page. One is Read, so it's dimmed there as in All.
 */
export const FIXTURE_KEPT_ROWS: ArticleRow[] = [
  {
    id: 'k1',
    feedId: 'f3',
    title: 'The iPhone’s quiet year',
    feedTitle: 'Daring Fireball',
    faviconUrl: FIREBALL_ICON,
    authors: ['John Gruber'],
    publishedAt: Date.UTC(2026, 9, 7, 12),
    read: false,
    saved: false,
  },
  {
    id: 'k2',
    feedId: 'f3',
    title: 'Notes on a long summer',
    feedTitle: 'Daring Fireball',
    faviconUrl: FIREBALL_ICON,
    authors: ['John Gruber'],
    publishedAt: Date.UTC(2026, 8, 2, 12),
    read: true,
    saved: false,
  },
];

/** More of The Verge's last 30 days, for a frequent site with more than five on its page (FEE-93). */
export const FIXTURE_BUSY_ROWS: ArticleRow[] = [16, 14, 12, 10].map((d, i) => ({
  id: `b${i + 1}`,
  title: [
    'Google’s new phone is mostly the old one',
    'The best e-readers to buy right now',
    'A smaller tablet makes a quiet comeback',
    'Why every app wants to be a browser',
  ][i],
  ...VERGE_FACE,
  publishedAt: day(d),
  read: false,
  saved: false,
}));

/**
 * Saved, most recently Saved first: the two Saved Articles from All (one already Read), and one whose
 * Feed was removed, which keeps its Feed's name but has no Feed to link to (T23).
 */
export const FIXTURE_SAVED_ROWS: ArticleRow[] = [
  FIXTURE_ROWS[2],
  FIXTURE_ROWS[1],
  {
    id: 's1',
    title: 'What the long winter taught a lighthouse keeper',
    subtitle: 'Three months alone on a rock, and the routines that kept the light on.',
    authors: ['Mara Lindqvist'],
    feedTitle: 'Morning Brief',
    publishedAt: day(2),
    read: false,
    saved: true,
  },
];

/** Every Article in All Read. */
export const FIXTURE_READ_ROWS: ArticleRow[] = FIXTURE_ROWS.map((row) => ({ ...row, read: true }));

/** An Article with every kind of block the Reading view draws (T17). */
export const FIXTURE_ARTICLE: ReadingArticle = {
  title: FIXTURE_ROWS[0].title,
  feedId: 'f1',
  feedTitle: VERGE,
  publishedAt: day(21),
  link: 'https://www.theverge.com/tech/1039554/un-regulations-killer-robots',
  subtitle: 'Countries agreed only to start discussing options for autonomous weapons.',
  authors: ['Terrence O’Brien'],
  saved: false,
  // The Feed's lead image is also the first image in its text: the Reading view shows it once.
  imageUrl: RUNWAY_PHOTO,
  omitted: [],
  blocks: [
    {
      type: 'image',
      src: RUNWAY_PHOTO,
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
  feedId: 'f2',
  feedTitle: 'Calm Notes',
  publishedAt: day(18),
  link: 'https://calmnotes.example/2026/slow-reading',
  subtitle: CALM_SUBTITLE,
  blocks: [{ type: 'paragraph', spans: [{ text: CALM_SUBTITLE }] }],
  omitted: [],
  page: 'extracting',
  saved: false,
};

/** A summary-only Article whose page couldn't be read: the fallback (Q6). */
export const FIXTURE_UNEXTRACTED_ARTICLE: ReadingArticle = {
  ...FIXTURE_EXTRACTING_ARTICLE,
  // An image, so the gallery shows the fallback as a reader would see it.
  imageUrl: RUNWAY_PHOTO,
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

/** Feeds found for "the verge" (FEE-80): The Verge itself, and a look-alike further down. */
export const FIXTURE_FOUND: FoundFeed[] = [
  { kind: 'new', url: 'https://www.theverge.com/rss/index.xml', title: VERGE, host: 'theverge.com', iconUrl: VERGE_ICON },
  { kind: 'new', url: 'https://vergeagency.com/feed', title: 'Verge Agency', host: 'vergeagency.com' },
];

/** The same search when you already follow The Verge: it says so, by its Feed (T22). */
export const FIXTURE_FOUND_FOLLOWING: FoundFeed[] = [
  { kind: 'following', feedId: 'f1', title: VERGE, host: 'theverge.com', iconUrl: VERGE_ICON },
  FIXTURE_FOUND[1],
];

/**
 * The chip row (P9): the Feeds by their newest Article. Calm Notes has no
 * icon; Daring Fireball has no Articles in the last 30 days, only its kept older ones (FEE-93).
 */
export const FIXTURE_CHIPS: FeedChip[] = [
  { id: 'f1', title: VERGE, faviconUrl: VERGE_ICON },
  { id: 'f2', title: 'Calm Notes' },
  { id: 'f3', title: 'Daring Fireball', faviconUrl: FIREBALL_ICON },
];

/** The Feed a world's Add a Feed adds: it joins the chips once added (FEE-45). */
export const FIXTURE_ADDED_CHIP: FeedChip = { id: 'f9', title: 'Kottke' };

/** Someone following eight Feeds, one with a long name: the chip row runs off-screen (FEE-44). */
export const FIXTURE_MANY_CHIPS: FeedChip[] = [
  { id: 'f1', title: 'The Verge - Full RSS for subscribers | The Verge', faviconUrl: VERGE_ICON },
  { id: 'f2', title: 'Calm Notes' },
  { id: 'f3', title: 'Daring Fireball', faviconUrl: FIREBALL_ICON },
  { id: 'f4', title: 'Farnam Street' },
  { id: 'f5', title: 'Stratechery' },
  { id: 'f6', title: 'Six Colors' },
  { id: 'f7', title: 'MacStories' },
  { id: 'f8', title: 'Kottke' },
];

/** Manage Feeds (D13): the Feeds by name; Farnam Street has stopped working. */
export const FIXTURE_MANAGE: ManagedFeed[] = [
  { id: 'f1', title: VERGE, faviconUrl: VERGE_ICON, host: 'www.theverge.com', working: true },
  { id: 'f2', title: 'Calm Notes', host: 'calmnotes.example', working: true },
  { id: 'f4', title: 'Farnam Street', faviconUrl: FARNAM_ICON, host: 'fs.blog', working: false },
];


/** The signed-in User's Account (P17): a made-up person, never the owner's real Google account (Q22). */
export const FIXTURE_ACCOUNT: Account = { name: 'Ada Lovelace', email: 'ada@example.com', initial: 'A' };

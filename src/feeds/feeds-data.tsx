import { createContext, use } from 'react';

import type { Block, OmittedKind, Span } from '../../convex/lib/feed/blocks';
import type { AddFeedReason, ReadingPage } from '../../convex/lib/feed/validators';

export type { AddFeedReason, Block, OmittedKind, Span };
export { isAddress } from '../../convex/lib/feed/typed';

/** One Article in All or a Feed's list (P12). Never carries a feed URL (Q9). */
export type ArticleRow = {
  id: string;
  /** Absent only for an Article whose Feed is gone; the server still allows it until FEE-98. */
  feedId?: string;
  title: string;
  subtitle?: string;
  /** The lead image beside it, when there is one. */
  imageUrl?: string;
  /** Who wrote it, by name (FEE-41). */
  authors?: string[];
  feedTitle: string;
  /** From the Feed's site; absent when the Feed gave no site. */
  faviconUrl?: string;
  publishedAt: number;
  /** Opened before (P7): dimmed, never hidden. */
  read: boolean;
};

/** One Article as the Reading view shows it. */
export type ReadingArticle = {
  title: string;
  /** Its Feed, which the Reading view's Feed name links to (FEE-47); absent once removed (T23). */
  feedId?: string;
  feedTitle: string;
  publishedAt: number;
  /** The original page, when the Feed gave an https one. */
  link?: string;
  subtitle?: string;
  /** Who wrote it, by name (FEE-41). */
  authors?: string[];
  /** The lead image (the Feed's, else its page's), for when the text couldn't be brought in. */
  imageUrl?: string;
  blocks: Block[];
  omitted: OmittedKind[];
  /**
   * A summary-only Article (T8): its page is still being read, or couldn't be (Q6). Absent once
   * the text is whole.
   */
  page?: ReadingPage;
};

export type AllView = { status: 'loading' } | { status: 'ready'; articles: ArticleRow[] };
/** When All was last brought up to date (FEE-47); `at` is null with no Feeds, or none fetched yet. */
export type LastUpdatedView = { status: 'loading' } | { status: 'ready'; at: number | null };

/** One Feed's chip (P5, P9). Never carries a feed URL (Q9). */
export type FeedChip = { id: string; title: string; faviconUrl?: string };
export type ChipsView = { status: 'loading' } | { status: 'ready'; chips: FeedChip[] };
/**
 * Removing a Feed and its Articles (T23): `ok` once it's gone (or already was); `failed` when it didn't
 * reach the server (offline, or an error), so nothing changed (Q5).
 */
export type RemoveFeed = (id: string) => Promise<'ok' | 'failed'>;

/**
 * The Article the Reading view opens. While it loads, `title` is the one a list already showed for it, when
 * there was one, so the page fades in with its headline as it grows from the row (FEE-48, FEE-114).
 */
export type ArticleView = { status: 'loading'; title?: string } | { status: 'missing' } | { status: 'ready'; article: ReadingArticle };
/**
 * What adding a Feed came to: added, by the new Feed's id, so its chip can open (FEE-45); already
 * followed at that URL (by its name), which takes the User back to it; or stay, with the view saying
 * why (an error, or feeds to choose from).
 */
export type AddOutcome =
  | { kind: 'added'; feedId: string }
  | { kind: 'already'; title: string; feedId: string }
  | { kind: 'stay' };

/** A feed a site advertises, to choose from (T21). */
export type FeedChoice = { url: string; title: string };

export type AddFeedView =
  | { status: 'idle' }
  | { status: 'busy' }
  | { status: 'error'; reason: AddFeedReason }
  | { status: 'choose'; choices: FeedChoice[] };

/**
 * Everything the screens read and do with Feeds and Articles. Convex backs it in the app
 * (`ConvexFeeds`); a world gives fixture data in tests and the state gallery. Each member is
 * a hook, so call them unconditionally, at the top of a component.
 */
export type FeedsData = {
  /** All, or with a Feed's id, only that Feed's Articles (P5). */
  useAll: (feedId: string | null) => AllView;
  /** The chip row's Feeds, in order (P9). */
  useChips: () => ChipsView;
  /** Removing a Feed, from its chip (FEE-97). */
  useRemoveFeed: () => RemoveFeed;
  useArticle: (id: string) => ArticleView;
  /**
   * Starts loading an Article as its row is touched (FEE-114), so the page can grow into its lead image
   * rather than open before it's there. Kept loading briefly, then let go.
   */
  usePrefetchArticle: () => (id: string) => void;
  /**
   * Adding a Feed: where it's up to, and `add`, which resolves to what happened. Only an address is
   * added (T21); any other text is the invalid-address error, with nothing sent (FEE-96).
   */
  useAddFeed: () => { view: AddFeedView; add: (typed: string) => Promise<AddOutcome> };
  /** Pulling down: fetches every Feed now, on the server (P15, Q21). */
  useRefresh: () => { refreshing: boolean; refresh: () => Promise<void> };
  /** The newest fetch across the User's Feeds, for the line under the Feeds title (FEE-47). */
  useLastUpdated: () => LastUpdatedView;
  /** Marks an Article Read (P7), for the Reading view to call when it opens one. */
  useMarkRead: () => (id: string) => void;
};

export const FeedsContext = createContext<FeedsData | null>(null);

export function useFeedsData(): FeedsData {
  const feeds = use(FeedsContext);
  if (!feeds) throw new Error('useFeedsData needs a feeds provider above it');
  return feeds;
}

// The adapters' hooks are chosen at runtime, which React Compiler can't follow; calling them
// from these one-line hooks keeps the bail-out here instead of in every screen.

/** All, or one Feed's Articles, from whichever Feeds the app or world provides. */
export function useAll(feedId: string | null): AllView {
  const { useAll: read } = useFeedsData();
  return read(feedId);
}

/** The chip row's Feeds. */
export function useChips(): ChipsView {
  const { useChips: read } = useFeedsData();
  return read();
}

/** Removing a Feed. */
export function useRemoveFeed(): RemoveFeed {
  const { useRemoveFeed: read } = useFeedsData();
  return read();
}

/** One Article for the Reading view. */
export function useArticle(id: string): ArticleView {
  const { useArticle: read } = useFeedsData();
  return read(id);
}

/** Starting to load an Article before it's opened. */
export function usePrefetchArticle(): (id: string) => void {
  const { usePrefetchArticle: read } = useFeedsData();
  return read();
}

/** Adding a Feed. */
export function useAddFeed(): ReturnType<FeedsData['useAddFeed']> {
  const { useAddFeed: read } = useFeedsData();
  return read();
}

/** Marking an Article Read. */
export function useMarkRead(): ReturnType<FeedsData['useMarkRead']> {
  const { useMarkRead: read } = useFeedsData();
  return read();
}

/** Pulling down to fetch every Feed now. */
export function useRefresh(): ReturnType<FeedsData['useRefresh']> {
  const { useRefresh: read } = useFeedsData();
  return read();
}

/** When All was last brought up to date. */
export function useLastUpdated(): LastUpdatedView {
  const { useLastUpdated: read } = useFeedsData();
  return read();
}

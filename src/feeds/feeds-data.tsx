import { createContext, use } from 'react';

import type { Block, OmittedKind, Span } from '../../convex/lib/feed/blocks';
import type { AddFeedReason } from '../../convex/lib/feed/validators';

export type { AddFeedReason, Block, OmittedKind, Span };

/** One Article in All (P12). Never carries a feed URL (Q9). */
export type ArticleRow = {
  id: string;
  title: string;
  subtitle?: string;
  /** The lead image beside it, when there is one. */
  imageUrl?: string;
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
  feedTitle: string;
  publishedAt: number;
  /** The original page, when the Feed gave an https one. */
  link?: string;
  blocks: Block[];
  omitted: OmittedKind[];
};

export type AllView = { status: 'loading' } | { status: 'ready'; articles: ArticleRow[] };
export type ArticleView = { status: 'loading' } | { status: 'missing' } | { status: 'ready'; article: ReadingArticle };
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
  useAll: () => AllView;
  useArticle: (id: string) => ArticleView;
  /** Adding a Feed: where it's up to, and `add`, which resolves true once the Feed is added. */
  useAddFeed: () => { view: AddFeedView; add: (url: string) => Promise<boolean> };
  /** Pulling down: fetches every Feed now, on the server (P15, Q21). */
  useRefresh: () => { refreshing: boolean; refresh: () => Promise<void> };
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

/** All, from whichever Feeds the app or world provides. */
export function useAll(): AllView {
  const { useAll: read } = useFeedsData();
  return read();
}

/** One Article for the Reading view. */
export function useArticle(id: string): ArticleView {
  const { useArticle: read } = useFeedsData();
  return read(id);
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

import { createContext, use } from 'react';

import type { Block, OmittedKind, Span } from '../../convex/lib/feed/blocks';
import type { AddFeedReason } from '../../convex/lib/feed/validators';

export type { AddFeedReason, Block, OmittedKind, Span };

/** One Article in All. Never carries a feed URL (Q9). */
export type ArticleRow = { id: string; title: string; feedTitle: string; publishedAt: number };

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
export type AddFeedView = { status: 'idle' } | { status: 'busy' } | { status: 'error'; reason: AddFeedReason };

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
};

export const FeedsContext = createContext<FeedsData | null>(null);

export function useFeedsData(): FeedsData {
  const feeds = use(FeedsContext);
  if (!feeds) throw new Error('useFeedsData needs a feeds provider above it');
  return feeds;
}

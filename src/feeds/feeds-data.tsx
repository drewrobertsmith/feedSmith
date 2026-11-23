import { createContext, use } from 'react';

import type { Block, OmittedKind, Span } from '../../convex/lib/feed/blocks';
import type { AddFeedReason, ReadingPage } from '../../convex/lib/feed/validators';

export type { AddFeedReason, Block, OmittedKind, Span };

/** One Article in All, a Feed's list, or Saved (P12). Never carries a feed URL (Q9). */
export type ArticleRow = {
  id: string;
  /** Absent for a Saved Article whose Feed was removed (T23). */
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
  /** Saved (Q3): marked in Gold (D5). */
  saved: boolean;
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
  /** Saved (Q3): the Reading view offers Done instead of Save. */
  saved: boolean;
};

export type AllView = { status: 'loading' } | { status: 'ready'; articles: ArticleRow[] };
/** Saved, most recently Saved first (P14). */
export type SavedView = AllView;
/** An Article's Saved and Read state before Save or Done, which Undo puts back (Q35). */
export type SavedBefore = { savedAt?: number; readAt?: number };
/**
 * Saving and marking Done (Q3, P8). Each shows at once, before the server answers. `save` and
 * `done` resolve to what the Article was before, for Undo, or null when it didn't go through.
 */
export type SavedActions = {
  save: (id: string) => Promise<SavedBefore | null>;
  done: (id: string) => Promise<SavedBefore | null>;
  restore: (id: string, before: SavedBefore) => Promise<void>;
};
/** When All was last brought up to date (FEE-47); `at` is null with no Feeds, or none fetched yet. */
export type LastUpdatedView = { status: 'loading' } | { status: 'ready'; at: number | null };

/** One Feed's chip (P5, P9). Never carries a feed URL (Q9). */
export type FeedChip = { id: string; title: string; faviconUrl?: string; pinned: boolean };
export type ChipsView = { status: 'loading' } | { status: 'ready'; chips: FeedChip[] };
/** One Feed in Manage Feeds (D13): its site host, never its URL (Q9), and whether it works (P15). */
export type ManagedFeed = { id: string; title: string; faviconUrl?: string; host: string; pinned: boolean; working: boolean };
export type ManageView = { status: 'loading' } | { status: 'ready'; feeds: ManagedFeed[] };
export type ManageActions = {
  /** `failed`: it didn't reach the server (offline, or an error), so the name can be tried again (Q5). */
  rename: (id: string, title: string) => Promise<'ok' | 'invalid-name' | 'not-found' | 'failed'>;
  /** `ok` once the Feed is gone (or already was); `failed` when it didn't reach the server. */
  remove: (id: string) => Promise<'ok' | 'failed'>;
  /** The Pinned Feeds' ids in their new order. */
  orderPins: (ids: string[]) => Promise<void>;
};

/** What Pinning or unpinning came to: a fourth Pin is refused (P9). */
export type PinOutcome = 'ok' | 'pins-full' | 'not-found';
export type ArticleView = { status: 'loading' } | { status: 'missing' } | { status: 'ready'; article: ReadingArticle };
/**
 * What adding a Feed came to: added; already followed at that URL (by its name), which takes
 * the User back to it; or stay, with the view saying why (an error, or feeds to choose from).
 */
export type AddOutcome = { kind: 'added' } | { kind: 'already'; title: string; feedId: string } | { kind: 'stay' };

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
  /** Saved, most recently Saved first (P14). */
  useSaved: () => SavedView;
  /** Saving, marking Done, and Undo. */
  useSavedActions: () => SavedActions;
  /** Pins or unpins a Feed. */
  useSetPinned: () => (id: string, pinned: boolean) => Promise<PinOutcome>;
  /** Manage Feeds' list, Pinned first in order (D13). */
  useManage: () => ManageView;
  /** Renaming, removing and ordering Pinned Feeds. */
  useManageActions: () => ManageActions;
  useArticle: (id: string) => ArticleView;
  /** Adding a Feed: where it's up to, and `add`, which resolves to what happened. */
  useAddFeed: () => { view: AddFeedView; add: (url: string) => Promise<AddOutcome> };
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

/** Saved's Articles. */
export function useSaved(): SavedView {
  const { useSaved: read } = useFeedsData();
  return read();
}

/** Saving, marking Done, and Undo. */
export function useSavedActions(): SavedActions {
  const { useSavedActions: read } = useFeedsData();
  return read();
}

/** The chip row's Feeds. */
export function useChips(): ChipsView {
  const { useChips: read } = useFeedsData();
  return read();
}

/** Manage Feeds' list. */
export function useManage(): ManageView {
  const { useManage: read } = useFeedsData();
  return read();
}

/** Renaming, removing and ordering. */
export function useManageActions(): ManageActions {
  const { useManageActions: read } = useFeedsData();
  return read();
}

/** Pinning and unpinning. */
export function useSetPinned(): ReturnType<FeedsData['useSetPinned']> {
  const { useSetPinned: read } = useFeedsData();
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

/** When All was last brought up to date. */
export function useLastUpdated(): LastUpdatedView {
  const { useLastUpdated: read } = useFeedsData();
  return read();
}

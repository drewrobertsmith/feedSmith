import { useAction, useConvexAuth, useMutation, useQuery } from 'convex/react';
import type { OptimisticLocalStore } from 'convex/browser';
import type { FunctionArgs, FunctionReference, FunctionReturnType } from 'convex/server';
import { useEffect, useState, type ReactNode } from 'react';

import { api } from '../../convex/_generated/api';
import { useAuth } from '@/auth/auth-context';
import {
  FeedsContext,
  type AddFeedView,
  type AddOutcome,
  type AllView,
  type ArticleView,
  type ChipsView,
  type ManageActions,
  type ManageView,
  type PinOutcome,
  type PinResult,
  type FeedsData,
  type SavedActions,
  type SavedView,
  type LastUpdatedView,
} from '@/feeds/feeds-data';

/**
 * A query that runs only while signed in, and not while the Account is being deleted. Every User
 * query refuses a caller without a session (Q10), and the session ends before the route guard
 * leaves Feeds: on signing out (FEE-35), and the moment `deleteAccount` revokes it on the server
 * (FEE-36). A query still subscribed then would throw; skipped, it just stops, and comes back if
 * the delete fails.
 */
function useSignedInQuery<Query extends FunctionReference<'query'>>(query: Query, args: FunctionArgs<Query>) {
  const { isAuthenticated } = useConvexAuth();
  const { deletion } = useAuth();
  const live = isAuthenticated && deletion !== 'deleting';
  return useQuery(query, ...((live ? [args] : ['skip']) as [FunctionArgs<Query> | 'skip']));
}

/**
 * The titles of the Articles the lists have shown, by id, so the Reading view can show an Article's headline
 * from its first frame, before the Article itself arrives (FEE-48). Only titles the User already saw; kept in
 * memory for this run of the app, at most `TITLES_KEPT` of them, and forgotten when the User signs out.
 */
const shownTitles = new Map<string, string>();
const TITLES_KEPT = 500;

function rememberTitles(articles: { id: string; title: string }[] | undefined) {
  for (const { id, title } of articles ?? []) {
    shownTitles.delete(id);
    shownTitles.set(id, title);
  }
  for (const oldest of shownTitles.keys()) {
    if (shownTitles.size <= TITLES_KEPT) break;
    shownTitles.delete(oldest);
  }
}

function useAll(feedId: string | null): AllView {
  const articles = useSignedInQuery(api.articles.all, feedId === null ? {} : { feedId });
  useEffect(() => rememberTitles(articles), [articles]);
  return articles === undefined ? { status: 'loading' } : { status: 'ready', articles };
}

function useSaved(): SavedView {
  const articles = useSignedInQuery(api.articles.saved, {});
  useEffect(() => rememberTitles(articles), [articles]);
  return articles === undefined ? { status: 'loading' } : { status: 'ready', articles };
}

type Row = FunctionReturnType<typeof api.articles.saved>[number];

/**
 * Shows an Article Saved or not, and Read, everywhere the app has it (Q3): every list of All and
 * its Feeds, Saved, and its Reading view, before the server answers. A refusal rolls it back.
 */
function showSaved(store: OptimisticLocalStore, id: string, saved: boolean) {
  const mark = (row: Row): Row => (row.id === id ? { ...row, saved, read: saved ? row.read : true } : row);
  let found: Row | undefined;
  for (const { args, value } of store.getAllQueries(api.articles.all)) {
    if (!value) continue;
    found ??= value.find((row) => row.id === id);
    store.setQuery(api.articles.all, args, value.map(mark));
  }
  const list = store.getQuery(api.articles.saved, {});
  if (list) {
    found ??= list.find((row) => row.id === id);
    const rest = list.filter((row) => row.id !== id);
    // Newly Saved goes to the top; one already there keeps its place.
    const already = list.some((row) => row.id === id);
    store.setQuery(api.articles.saved, {}, saved && found ? (already ? list : [mark(found), ...rest]) : rest);
  }
  for (const { args, value } of store.getAllQueries(api.articles.get)) {
    if (value && args.id === id) store.setQuery(api.articles.get, args, { ...value, saved });
  }
}

function useSavedActions(): SavedActions {
  const save = useMutation(api.articles.save).withOptimisticUpdate((store, { id }) => showSaved(store, id, true));
  const done = useMutation(api.articles.done).withOptimisticUpdate((store, { id }) => showSaved(store, id, false));
  // Undo puts the server's state back; the lists follow when it answers.
  const restore = useMutation(api.articles.restore);
  return {
    save: (id) => save({ id }).catch(() => null),
    done: (id) => done({ id }).catch(() => null),
    restore: async (id, before) => {
      await restore({ id, ...before }).catch(() => null);
    },
  };
}

function useChips(): ChipsView {
  const chips = useSignedInQuery(api.feeds.chips, {});
  return chips === undefined ? { status: 'loading' } : { status: 'ready', chips };
}

/**
 * Pins or unpins at once (Q35): the chip and Manage Feeds show it before the server answers, and
 * the server's order follows. A refusal (a fourth Pin) rolls it back.
 */
function useSetPinned() {
  const setPinned = useMutation(api.feeds.setPinned).withOptimisticUpdate((store, { id, pinned }) => {
    const chips = store.getQuery(api.feeds.chips, {});
    if (chips) store.setQuery(api.feeds.chips, {}, chips.map((chip) => (chip.id === id ? { ...chip, pinned } : chip)));
    const feeds = store.getQuery(api.feeds.manage, {});
    if (feeds) store.setQuery(api.feeds.manage, {}, feeds.map((feed) => (feed.id === id ? { ...feed, pinned } : feed)));
  });
  return async (id: string, pinned: boolean): Promise<PinResult> => {
    const result = await setPinned({ id, pinned }).catch(() => null);
    if (!result) return { outcome: 'not-found' };
    if (!result.ok) return { outcome: result.reason };
    return result.place === undefined ? { outcome: 'ok' } : { outcome: 'ok', place: result.place };
  };
}

function useRestorePin() {
  const restorePin = useMutation(api.feeds.restorePin);
  return async (id: string, place?: number): Promise<PinOutcome> => {
    const result = await restorePin(place === undefined ? { id } : { id, place }).catch(() => null);
    if (!result) return 'not-found';
    return result.ok ? 'ok' : result.reason;
  };
}

function useArticle(id: string): ArticleView {
  const article = useSignedInQuery(api.articles.get, { id });
  if (article === undefined) return { status: 'loading', title: shownTitles.get(id) };
  return article === null ? { status: 'missing' } : { status: 'ready', article };
}

function useAddFeed() {
  const addFeed = useAction(api.feeds.add);
  const [view, setView] = useState<AddFeedView>({ status: 'idle' });

  const add = async (url: string): Promise<AddOutcome> => {
    setView({ status: 'busy' });
    try {
      const result = await addFeed({ url: url.trim() });
      if (result.ok) {
        setView({ status: 'idle' });
        return { kind: 'added' };
      }
      if (result.reason === 'already-added') {
        setView({ status: 'idle' });
        return { kind: 'already', title: result.title, feedId: result.feedId };
      }
      if (result.reason === 'choose') setView({ status: 'choose', choices: result.choices });
      else setView({ status: 'error', reason: result.reason });
      return { kind: 'stay' };
    } catch {
      // The call itself failed (no connection, or the server is down).
      setView({ status: 'error', reason: 'unreachable' });
      return { kind: 'stay' };
    }
  };

  return { view, add };
}

function useRefresh() {
  const refreshAll = useAction(api.feeds.refreshAll);
  const [refreshing, setRefreshing] = useState(false);

  const refresh = async () => {
    setRefreshing(true);
    // A failed pull changes nothing on screen; the schedule keeps Feeds fresh regardless.
    await refreshAll().catch(() => null);
    setRefreshing(false);
  };

  return { refreshing, refresh };
}

function useMarkRead() {
  const markRead = useMutation(api.articles.markRead);
  return (id: string) => {
    // Read is best-effort: a dropped call leaves the Article undimmed, nothing worse.
    void markRead({ id }).catch(() => null);
  };
}

function useManage(): ManageView {
  const feeds = useSignedInQuery(api.feeds.manage, {});
  return feeds === undefined ? { status: 'loading' } : { status: 'ready', feeds };
}

function useManageActions(): ManageActions {
  const rename = useMutation(api.feeds.rename);
  const remove = useMutation(api.feeds.remove);
  // The new order shows at once, so a dropped row settles where it was let go; a refusal rolls it back.
  const orderPins = useMutation(api.feeds.orderPins).withOptimisticUpdate((store, { ids }) => {
    const feeds = store.getQuery(api.feeds.manage, {});
    if (!feeds) return;
    const rank = new Map(ids.map((id, i) => [id, i]));
    const pinned = feeds.filter((feed) => feed.pinned).sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
    store.setQuery(api.feeds.manage, {}, [...pinned, ...feeds.filter((feed) => !feed.pinned)]);
  });
  return {
    rename: async (id, title) => {
      const result = await rename({ id, title }).catch(() => null);
      if (!result) return 'failed';
      return result.ok ? 'ok' : result.reason;
    },
    remove: async (id) => ((await remove({ id }).catch(() => null)) ? 'ok' : 'failed'),
    orderPins: async (ids) => {
      await orderPins({ ids }).catch(() => null);
    },
  };
}

function useLastUpdated(): LastUpdatedView {
  const at = useSignedInQuery(api.feeds.lastUpdated, {});
  return at === undefined ? { status: 'loading' } : { status: 'ready', at };
}

const convexFeeds: FeedsData = {
  useAll,
  useChips,
  useSaved,
  useSavedActions,
  useSetPinned,
  useRestorePin,
  useManage,
  useManageActions,
  useArticle,
  useAddFeed,
  useRefresh,
  useMarkRead,
  useLastUpdated,
};

/** The app's Feeds and Articles, from Convex. Sits inside `ConvexAuth`, which owns the client. */
export function ConvexFeeds({ children }: { children: ReactNode }) {
  // Signing out, or deleting the Account, forgets the titles the lists showed: another account never sees them.
  const { isAuthenticated } = useConvexAuth();
  useEffect(() => {
    if (!isAuthenticated) shownTitles.clear();
  }, [isAuthenticated]);
  return <FeedsContext value={convexFeeds}>{children}</FeedsContext>;
}

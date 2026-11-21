import { useAction, useMutation, useQuery } from 'convex/react';
import { useState, type ReactNode } from 'react';

import { api } from '../../convex/_generated/api';
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
  type FeedsData,
} from '@/feeds/feeds-data';

function useAll(feedId: string | null): AllView {
  const articles = useQuery(api.articles.all, feedId === null ? {} : { feedId });
  return articles === undefined ? { status: 'loading' } : { status: 'ready', articles };
}

function useChips(): ChipsView {
  const chips = useQuery(api.feeds.chips);
  return chips === undefined ? { status: 'loading' } : { status: 'ready', chips };
}

function useSetPinned() {
  const setPinned = useMutation(api.feeds.setPinned);
  return async (id: string, pinned: boolean): Promise<PinOutcome> => {
    const result = await setPinned({ id, pinned }).catch(() => null);
    if (!result) return 'not-found';
    return result.ok ? 'ok' : result.reason;
  };
}

function useArticle(id: string): ArticleView {
  const article = useQuery(api.articles.get, { id });
  if (article === undefined) return { status: 'loading' };
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
  const feeds = useQuery(api.feeds.manage);
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

const convexFeeds: FeedsData = {
  useAll,
  useChips,
  useSetPinned,
  useManage,
  useManageActions,
  useArticle,
  useAddFeed,
  useRefresh,
  useMarkRead,
};

/** The app's Feeds and Articles, from Convex. Sits inside `ConvexAuth`, which owns the client. */
export function ConvexFeeds({ children }: { children: ReactNode }) {
  return <FeedsContext value={convexFeeds}>{children}</FeedsContext>;
}

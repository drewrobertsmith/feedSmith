import { useAction, useQuery } from 'convex/react';
import { useState, type ReactNode } from 'react';

import { api } from '../../convex/_generated/api';
import { FeedsContext, type AddFeedView, type AllView, type ArticleView, type FeedsData } from '@/feeds/feeds-data';

function useAll(): AllView {
  const articles = useQuery(api.articles.all);
  return articles === undefined ? { status: 'loading' } : { status: 'ready', articles };
}

function useArticle(id: string): ArticleView {
  const article = useQuery(api.articles.get, { id });
  if (article === undefined) return { status: 'loading' };
  return article === null ? { status: 'missing' } : { status: 'ready', article };
}

function useAddFeed() {
  const addFeed = useAction(api.feeds.add);
  const [view, setView] = useState<AddFeedView>({ status: 'idle' });

  const add = async (url: string) => {
    setView({ status: 'busy' });
    try {
      const result = await addFeed({ url: url.trim() });
      setView(result.ok ? { status: 'idle' } : { status: 'error', reason: result.reason });
      return result.ok;
    } catch {
      // The call itself failed (no connection, or the server is down).
      setView({ status: 'error', reason: 'unreachable' });
      return false;
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

const convexFeeds: FeedsData = { useAll, useArticle, useAddFeed, useRefresh };

/** The app's Feeds and Articles, from Convex. Sits inside `ConvexAuth`, which owns the client. */
export function ConvexFeeds({ children }: { children: ReactNode }) {
  return <FeedsContext value={convexFeeds}>{children}</FeedsContext>;
}

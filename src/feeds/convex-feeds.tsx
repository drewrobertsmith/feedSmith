import { useAction, useConvex, useConvexAuth, useConvexConnectionState, useMutation, useQuery } from 'convex/react';
import type { FunctionArgs, FunctionReference } from 'convex/server';
import { useEffect, useState, type ReactNode } from 'react';

import { api } from '../../convex/_generated/api';
import { useAuth } from '@/auth/auth-context';
import { connectionOf, type Connection } from '@/feeds/connection';
import {
  FeedsContext,
  isAddress,
  type AddFeedView,
  type AddOutcome,
  type AllView,
  type ArticleView,
  type ChipsView,
  type RemoveFeed,
  type TryAgain,
  type FeedsData,
  type LastUpdatedView,
} from '@/feeds/feeds-data';
import { usePull } from '@/feeds/use-pull';

/**
 * A query that runs only while signed in, and not while the Account is being deleted. Every User
 * query refuses a caller without a session (Q10), and the session ends before the route guard
 * leaves Feeds: on signing out (FEE-35), and the moment `deleteAccount` revokes it on the server
 * (FEE-36). A query still subscribed then would throw; skipped, it just stops, and comes back if
 * the delete fails.
 */
function useSignedInQuery<Query extends FunctionReference<'query'>>(query: Query, args: FunctionArgs<Query> | 'skip') {
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

function useChips(): ChipsView {
  const chips = useSignedInQuery(api.feeds.chips, {});
  return chips === undefined ? { status: 'loading' } : { status: 'ready', chips };
}

function useArticle(id: string): ArticleView {
  const article = useSignedInQuery(api.articles.get, { id });
  if (article === undefined) return { status: 'loading', title: shownTitles.get(id) };
  return article === null ? { status: 'missing' } : { status: 'ready', article };
}

/** How long a touched row's Article keeps loading for the Reading view to pick up (FEE-114). */
const PREFETCH_KEPT = 5000;

function usePrefetchArticle() {
  const client = useConvex();
  const { isAuthenticated } = useConvexAuth();
  const { deletion } = useAuth();
  return (id: string) => {
    // Only while signed in, as every query here (`useSignedInQuery`).
    if (!isAuthenticated || deletion === 'deleting') return;
    // Watched briefly: the Reading view's own query shares it if it opens, and it's let go either way (Q20).
    const stop = client.watchQuery(api.articles.get, { id }).onUpdate(() => {});
    setTimeout(stop, PREFETCH_KEPT);
  };
}

function useAddFeed() {
  const addFeed = useAction(api.feeds.add);
  const [view, setView] = useState<AddFeedView>({ status: 'idle' });

  const add = async (typed: string): Promise<AddOutcome> => {
    const text = typed.trim();
    // Only an address is added; anything else (a name, say) is never sent (FEE-96).
    if (!isAddress(text)) {
      setView({ status: 'error', reason: 'invalid-url' });
      return { kind: 'stay' };
    }
    setView({ status: 'busy' });
    try {
      const result = await addFeed({ url: text });
      if (result.ok) {
        setView({ status: 'idle' });
        return { kind: 'added', feedId: result.feedId };
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
  const at = useSignedInQuery(api.feeds.lastUpdated, {});
  // A failed pull changes nothing on screen; the schedule keeps Feeds fresh regardless. A pull's results
  // reach the line and the rows together, after the pull answers: "Updating…" lasts until then (FEE-103).
  return usePull(() => refreshAll().catch(() => null), at);
}

function useMarkRead() {
  const markRead = useMutation(api.articles.markRead);
  return (id: string) => {
    // Read is best-effort: a dropped call leaves the Article undimmed, nothing worse.
    void markRead({ id }).catch(() => null);
  };
}

function useRemoveFeed(): RemoveFeed {
  const remove = useMutation(api.feeds.remove);
  return async (id) => ((await remove({ id }).catch(() => null)) ? 'ok' : 'failed');
}

function useTryAgain(feedId: string): TryAgain {
  const fetchNow = useAction(api.feeds.tryAgain);
  const [trying, setTrying] = useState(false);
  const tryAgain = () => {
    if (trying) return;
    setTrying(true);
    // Whatever it finds, the chips' live query shows; a call that never reached the server changes nothing (Q5).
    void fetchNow({ id: feedId })
      .catch(() => null)
      .finally(() => setTrying(false));
  };
  return { trying, tryAgain };
}

function useLastUpdated(): LastUpdatedView {
  const at = useSignedInQuery(api.feeds.lastUpdated, {});
  return at === undefined ? { status: 'loading' } : { status: 'ready', at };
}

function useConnection(): Connection {
  return connectionOf(useConvexConnectionState());
}

const convexFeeds: FeedsData = {
  useAll,
  useChips,
  useRemoveFeed,
  useTryAgain,
  useArticle,
  usePrefetchArticle,
  useAddFeed,
  useRefresh,
  useMarkRead,
  useLastUpdated,
  useConnection,
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
